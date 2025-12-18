(function () {
  const CDN_CANDIDATES = [
    "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js",
    "https://unpkg.com/chart.js@4/dist/chart.umd.min.js"
  ];

  const DATALABELS_CDNS = [
    "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2",
    "https://unpkg.com/chartjs-plugin-datalabels@2"
  ];

  function loadScriptSequential(urls) {
    return new Promise((resolve, reject) => {
      const tryNext = (i) => {
        if (i >= urls.length) return reject(new Error("All URLs blocked or unreachable."));
        const s = document.createElement("script");
        s.src = urls[i];
        s.onload = () => resolve();
        s.onerror = () => { s.remove(); tryNext(i + 1); };
        document.head.appendChild(s);
      };
      tryNext(0);
    });
  }

  class PerciComboChart extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });

      const container = document.createElement("div");
      Object.assign(container.style, { width: "100%", height: "100%", display: "flex" });

      this._canvas = document.createElement("canvas");
      Object.assign(this._canvas.style, { width: "100%", height: "100%" });
      container.appendChild(this._canvas);
      this._shadow.appendChild(container);

      this._chart = null;
    }

    _updateSourceFromBinding(binding) {
      this._SourceData = this._SourceData || {
        Products: [],
        Date: [],
        ProductCategory: [],
        ClearingPrice: [],
        SpreadCapture: []
      };

      if (binding && Array.isArray(binding.data) && binding.data.length > 0) {
        const rows = binding.data;

        this._SourceData = {
          Products: [],
          Date: [],
          ProductCategory: [],
          ClearingPrice: [],
          SpreadCapture: []
        };

        rows.forEach(r => {
          const date    = r["dimensions_0"]?.label ?? "";
          const product = r["dimensions_1"]?.label ?? "";
          const cat     = r["Product Category"] ?? r["dimensions_2"]?.label ?? "";

          const m0 = r["measures_0"];
          const m1 = r["measures_1"];

          const clearingRaw = m0 ? Number(m0.raw ?? m0.label ?? m0) : null;
          const clearing    = clearingRaw != null ? clearingRaw : null;

          const spreadRaw   = m1 ? Number(m1.raw ?? m1.label ?? m1) : null;
          const spread      = spreadRaw != null ? spreadRaw * 100 : null;

          this._SourceData.Products.push(String(product));
          this._SourceData.Date.push(String(date));
          this._SourceData.ProductCategory.push(String(cat));
          this._SourceData.ClearingPrice.push(clearing);
          this._SourceData.SpreadCapture.push(spread);
        });
      }
      if (this._SourceData && Array.isArray(this._SourceData.Date)) {
        this._buildMetaFromSource();
      }
    }

    _buildMetaFromSource() {
      const src = this._SourceData;

      const uniqueDates = Array.from(new Set(src.Date));
      const uniqueProducts = Array.from(new Set(src.Products));

      this._LabelData = { UniqueDate: uniqueDates };
      this._ProductListData = this._buildProductList(uniqueProducts);
    }

    _buildProductList(uniqueProducts) {
      const DAY_AHEAD_NAME = "Day Ahead";
      const LONG_TERM_NAME = "Long Term";

      const barColor = [];
      const lineColor = [];

      uniqueProducts.forEach(p => {
        if (p === DAY_AHEAD_NAME) {
          barColor.push("#93C47D");   // Day Ahead bar (green)
          lineColor.push("#7F7F7F");  // Day Ahead line (gray)
        } else if (p === LONG_TERM_NAME) {
          barColor.push("#F9CCCC");   // Long Term bar (light pink)
          lineColor.push("#000000");  // Long Term line (black)
        } else {
          barColor.push("#93C47D");
          lineColor.push("#7F7F7F");
        }
      });

      return {
        Product: uniqueProducts,
        BarColour: barColor,
        LineColour: lineColor
      };
    }

    connectedCallback() {
      loadScriptSequential(CDN_CANDIDATES)
        .then(() => loadScriptSequential(DATALABELS_CDNS))
        .then(() => {
          this._SourceData = {
            Products: [],
            Date: [],
            ProductCategory: [],
            ClearingPrice: [],
            SpreadCapture: []
          };

          this._LabelData = { UniqueDate: [] };
          this._ProductListData = { Product: [], BarColour: [], LineColour: [] };

          this._updateSourceFromBinding(this.main);
          this._render();
        })
        .catch(err =>
          this._showError("Chart.js or datalabels plugin could not be loaded. Check CSP or host internally.")
        );
    }

    onCustomWidgetAfterUpdate() {
      this._updateSourceFromBinding(this.main);
      this._render();
    }

    disconnectedCallback() { this._destroy(); }
    onCustomWidgetResize() { if (this._chart?.resize) this._chart.resize(); }

    _destroy() {
      if (this._chart?.destroy) this._chart.destroy();
      this._chart = null;
    }

    _showError(msg) {
      this._shadow.innerHTML = `<div style="font:14px sans-serif;padding:8px;color:#b00020">${msg}</div>`;
    }

    _buildDatasets() {
      const dates = this._LabelData.UniqueDate;
      const src = this._SourceData;
      const plist = this._ProductListData;

      const datasets = [];

      plist.Product.forEach((prodName, idx) => {
        const barData = new Array(dates.length).fill(null);
        const lineData = new Array(dates.length).fill(null);

        for (let i = 0; i < src.Date.length; i++) {
          if (src.Products[i] !== prodName) continue;

          const date = src.Date[i];
          const pos = dates.indexOf(date);
          if (pos === -1) continue;

          barData[pos]  = src.ClearingPrice[i];
          lineData[pos] = src.SpreadCapture[i];
        }

        const isLongTerm = prodName === "Day Ahead";
        
        // Use colors from the ProductListData which has correct mapping
        const barBgColor = plist.BarColour[idx];
        const labelBgColor = isLongTerm ? "#93C47D" : "#F9CCCC";
        const lineBorderColor = plist.LineColour[idx];
        const labelBgColor_1 = isLongTerm ? "#7F7F7F" : "#000000"

        // BAR DATASET
        datasets.push({
          type: "bar",
          label: prodName + " Clearing Price",
          // display: (ctx) => ctx.dataset.data[ctx.dataIndex] != null,
          display: "auto",
          data: barData,
          backgroundColor: labelBgColor,
          borderColor: barBgColor,
          borderWidth: 1,
          order: 1,
          z: 0,
          datalabels: {
            align: "top",
            anchor: "end",
            offset: 4,
            color: "#ffffff",
            backgroundColor: labelBgColor,
            borderRadius: 2,
            padding: {
              top: 4,
              bottom: 4,
              left: 6,
              right: 6
            },
            font: {
              weight: "bold",
              size: 11
            },
            // formatter: (v) => v == null ? "" : "€ " + v.toFixed(2)
            formatter: (v) => {
              if (v == null || isNaN(v)) return null; // prevents label box from rendering
              return "€ " + v.toFixed(2);
            }

          }
        });

        // LINE DATASET
        datasets.push({
          type: "line",
          label: prodName + " Spread Capture %",
          data: lineData,
          // display: (ctx) => ctx.dataset.data[ctx.dataIndex] != null,
          display: "auto",
          yAxisID: "y1",
          borderColor: labelBgColor_1,
          backgroundColor: "lineBorderColor",
          tension: 0,
          stepped: false,
          pointRadius: 4,
          pointHoverRadius: 5,
          pointBorderWidth: 2,
          pointBackgroundColor: "#7F7F7F", // grey points
          borderWidth: 2,
          order: 0,
          z: 10,
          datalabels: {
            align: "top",
            anchor: "end",
            // offset: 4,
            offset: (ctx) => {
              const i = ctx.dataIndex;
              const hasBar = barData[i] != null;
              // if there is a bar at this x, push the line label far above it
              return hasBar ? -20 : 4;
            },
            color: "#ffffff",
            backgroundColor: labelBgColor_1,
            borderRadius: 2,
            padding: {
              top: 4,
              bottom: 4,
              left: 6,
              right: 6
            },
            font: {
              weight: "bold",
              size: 11
            },
            formatter: (v) => v == null ? "" : v.toFixed(0) + "%"
          }
        });
      });

      return datasets;
    }

    _render() {
      if (!this._canvas || !window.Chart || !window.ChartDataLabels) return;

      const dates  = this._LabelData.UniqueDate;
      const labels = dates.map(d => d);

      const datasets = this._buildDatasets();

      this._destroy();
      const ctx = this._canvas.getContext("2d");

      this._chart = new window.Chart(ctx, {
        type: "bar",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          animation: false,
          layout: {
            padding: {
              top: 40
            }
          },
          plugins: {
            title: {
              display: true,
              text: "SPREAD CAPTURE VS CLEARING PRICE",
              font: { size: 20, weight: "bold" },
              align: "center",
              color: "#000000",
              padding: {
                top: 10,
                bottom: 30
              }
            },
            legend: {
              position: "bottom",
              align: "center",
              labels: {
                usePointStyle: true,
                padding: 18,
                boxWidth: 30,
                font: { size: 11 },
                generateLabels: (chart) => {
                  const base =
                    Chart.defaults.plugins.legend.labels.generateLabels(chart);
                  return base.map(l => {
                    const ds = chart.data.datasets[l.datasetIndex];
                    return {
                      ...l,
                      pointStyle: ds.type === "line" ? "line" : "rect"
                    };
                  });
                }
              }
            },
            // tooltip: {
            //   mode: "index",
            //   intersect: false,
            //   callbacks: {
            //     label: (ctx) => {
            //       const dsLabel = ctx.dataset.label || "";
            //       const v = ctx.parsed.y;
            //       if (dsLabel.includes("Spread Capture")) {
            //         return dsLabel + ": " + (v != null ? v.toFixed(0) + "%" : "");
            //       }
            //       return dsLabel + ": " + (v != null ? "€ " + v.toFixed(2) : "");
            //     }
            //   }
            // },
              tooltip: {
                mode: "index",
                intersect: false,
                filter: (ctx) => {
                  const v = ctx.parsed?.y;
                  return v !== null && v !== undefined && !isNaN(v);
                },
                callbacks: {
                  label: (ctx) => {
                    const dsLabel = ctx.dataset.label || "";
                    const v = ctx.parsed.y;

                    if (v == null || isNaN(v)) return null;

                    if (dsLabel.includes("Spread Capture")) {
                      return dsLabel + ": " + v.toFixed(0) + "%";
                    }
                    return dsLabel + ": € " + v.toFixed(2);
                  }
                }
              },

            datalabels: {
              display: true,
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: "Clearing Price (EUR)" },
              ticks: {
                callback: v => "€ " + Number(v).toFixed(0),
                padding: 5
              },
              grid: {
                drawBorder: false,
                drawOnChartArea: true,
                drawTicks: false,
                color: "#e0e0e0",
                borderDash: [],
                display: true
              },
              border: {
                display: false,
                width: 0
              }
            },
            y1: {
              beginAtZero: true,
              position: "right",
              grid: { 
                drawOnChartArea: false,
                drawBorder: false,
                drawTicks: false
              },
              ticks: {
                callback: v => v.toFixed(0) + "%",
                padding: 5
              },
              title: { display: true, text: "Spread Capture %" },
              border: {
                display: false,
                width: 0
              }
            },
            x: {
              grid: {
                display: false,
                drawBorder: false,
                drawOnChartArea: false,
                drawTicks: false,
                lineWidth: 0
              },
              border: {
                display: false,
                width: 0
              },
              ticks: {
                autoSkip: true,
                maxRotation: 0,
                minRotation: 0,
                display: true,
                backdropColor: 'transparent', // Removes background box behind tick labels
                color: '#000000', // Ensures tick text is visible
                padding: 5 // Adds spacing to avoid overlap
              }
            }
          }
        },
        plugins: [window.ChartDataLabels]
      });
    }
  }

  customElements.define("perci-combo-chart", PerciComboChart);
})();