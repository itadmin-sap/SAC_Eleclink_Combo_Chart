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
        DATE: [],
        PRODUCT_CODE: [],
        PRODUCT_CATEGORY: [],
        CLEARING_PRICE: [],
        SPREAD_CAPTURE: []
      };

      if (binding && Array.isArray(binding.data) && binding.data.length > 0) {
        const rows = binding.data;

        this._SourceData = {
          DATE: [],
          PRODUCT_CODE: [],
          PRODUCT_CATEGORY: [],
          CLEARING_PRICE: [],
          SPREAD_CAPTURE: []
        };

        rows.forEach(r => {
          // Map SAC binding positions to live model fields:
          // DATE              -> dimensions_0.label
          // PRODUCT_CODE      -> dimensions_1.label
          // PRODUCT_CATEGORY  -> dimensions_2.label
          // CLEARING_PRICE    -> measures_0
          // SPREAD_CAPTURE    -> measures_1
          const DATE             = r["dimensions_0"]?.label ?? "";
          const PRODUCT_CODE     = r["dimensions_1"]?.label ?? "";
          const PRODUCT_CATEGORY = r["dimensions_2"]?.label ?? "";

          const CLEARING_PRICE_raw_m = r["measures_0"];
          const SPREAD_CAPTURE_raw_m = r["measures_1"];

          const clearingRaw = CLEARING_PRICE_raw_m
            ? Number(CLEARING_PRICE_raw_m.raw ?? CLEARING_PRICE_raw_m.label ?? CLEARING_PRICE_raw_m)
            : null;
          const CLEARING_PRICE = clearingRaw != null ? clearingRaw : null;

          const spreadRaw = SPREAD_CAPTURE_raw_m
            ? Number(SPREAD_CAPTURE_raw_m.raw ?? SPREAD_CAPTURE_raw_m.label ?? SPREAD_CAPTURE_raw_m)
            : null;
          const SPREAD_CAPTURE = spreadRaw != null ? spreadRaw * 100 : null;

          this._SourceData.DATE.push(String(DATE));
          this._SourceData.PRODUCT_CODE.push(String(PRODUCT_CODE));
          this._SourceData.PRODUCT_CATEGORY.push(String(PRODUCT_CATEGORY));
          this._SourceData.CLEARING_PRICE.push(CLEARING_PRICE);
          this._SourceData.SPREAD_CAPTURE.push(SPREAD_CAPTURE);
        });
      }

      if (this._SourceData && Array.isArray(this._SourceData.DATE)) {
        this._buildMetaFromSource();
      }
    }

    _buildMetaFromSource() {
      const src = this._SourceData;

      const uniqueDates = Array.from(new Set(src.DATE));
      const uniqueProducts = Array.from(new Set(src.PRODUCT_CODE));

      this._LabelData = { UniqueDate: uniqueDates };
      this._ProductListData = this._buildProductList(uniqueProducts);
    }

    _buildProductList(uniqueProducts) {
      const DAY_AHEAD_NAME = "Day-Ahead";   // exact text in PRODUCT_CODE
      const LONG_TERM_NAME = "Long Term";

      const OTHER_COLORS = [ 
          "#F9CCCC", "#46b1e1", "#ff8b8b", "#215f9a",
          "#611bacff", "#CAFCF8", "#E8EED8", "#FAF5CC", 
          "#c19af8ff", "#F8CECE", "#D5CDF9" ];

          
      const barColor = [];
      const lineColor = [];
          
      let otherColorIndex = 0;


      uniqueProducts.forEach(p => {
        if (p === DAY_AHEAD_NAME) {
          barColor.push("#93C47D");   // Day-Ahead bar (green)
          lineColor.push("#7F7F7F");  // Day-Ahead line (gray)
        } else if (p === LONG_TERM_NAME) {
          // barColor.push("#F9CCCC");   // Long Term bar (light pink)
          const c = OTHER_COLORS[otherColorIndex % OTHER_COLORS.length];
          otherColorIndex += 1;
          barColor.push(c);
          lineColor.push(c);
          // lineColor.push("#000000");  // Long Term line (black)
        } else {
      // Other products: also use the list (or keep your own rule here)
          const c = OTHER_COLORS[otherColorIndex % OTHER_COLORS.length];
          otherColorIndex += 1;
          barColor.push(c);
          lineColor.push(c);
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
            DATE: [],
            PRODUCT_CODE: [],
            PRODUCT_CATEGORY: [],
            CLEARING_PRICE: [],
            SPREAD_CAPTURE: []
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

        // const OTHER_COLORS = [ 
        //   "#F9CCCC", "#46b1e1", "#ff8b8b", "#215f9a",
        //   "#611bacff", "#CAFCF8", "#E8EED8", "#FAF5CC", 
        //   "#c19af8ff", "#F8CECE", "#D5CDF9" ];

        // let otherColorIndex  = 0;

        for (let i = 0; i < src.DATE.length; i++) {
          if (src.PRODUCT_CODE[i] !== prodName) continue;

          const date = src.DATE[i];
          const pos = dates.indexOf(date);
          if (pos === -1) continue;

          barData[pos]  = src.CLEARING_PRICE[i];
          lineData[pos] = src.SPREAD_CAPTURE[i];
        }

        // PRODUCT_CATEGORY == "Day Ahead"
        // const isDayAhead = prodName === "Day-Ahead";

        // const barBgColor   = plist.BarColour[idx];
        // const labelBgColor = isDayAhead ? "#93C47D" : "#F9CCCC";
        // const lineBorderColor = plist.LineColour[idx];
        // const labelBgColor_1  = isDayAhead ? "#7F7F7F" : "#000000";

        const barBgColor      = plist.BarColour[idx];
        const lineBorderColor = plist.LineColour[idx];

        const labelBgColor   = barBgColor;
        // if the line is the gray Day-Ahead line, keep gray labels; otherwise black
        const labelBgColor_1 = lineBorderColor === "#7F7F7F" ? "#7F7F7F" : "#000000";

        // BAR DATASET (CLEARING_PRICE)
        datasets.push({
          type: "bar",
          label: prodName + " Clearing Price",
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
            formatter: (v) => {
              if (v == null || isNaN(v)) return null;
              return "€ " + v.toFixed(2);
            }
          }
        });

        // LINE DATASET (SPREAD_CAPTURE %)
        datasets.push({
          type: "line",
          label: prodName + " Spread Capture %",
          data: lineData,
          display: "auto",
          yAxisID: "y1",
          borderColor: labelBgColor_1,
          backgroundColor: lineBorderColor,
          tension: 0,
          stepped: false,
          pointRadius: 4,
          pointHoverRadius: 5,
          pointBorderWidth: 2,
          pointBackgroundColor: "#7F7F7F",
          borderWidth: 2,
          order: 0,
          z: 10,
          datalabels: {
            align: "top",
            anchor: "end",
            offset: (ctx) => {
              const i = ctx.dataIndex;
              const hasBar = barData[i] != null;
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
            formatter: (v) => v == null || isNaN(v) ? "" : v.toFixed(0) + "%"
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
            padding: { top: 35 , right: 0, bottom: 0, left: 0}
          },
          plugins: {
            title: {
              display: true,
              text: "SPREAD CAPTURE VS CLEARING PRICE",
              font: { size: 20, weight: "bold" },
              align: "center",
              color: "#000000",
              padding: { top:2, bottom: 30}
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
              display: true
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: "" },
              ticks: {
                callback: v => "€ " + Number(v).toFixed(0),
                padding: 20
              },
              grid: {
                drawBorder: false,
                drawOnChartArea: true,
                drawTicks: false,
                color: "#e0e0e0",
                borderDash: [],
                display: true
              },
              border: { display: false, width: 0 }
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
                padding: 20
              },
              title: { display: true, text: "" },
              border: { display: false, width: 0 }
            },
            x: {
              grid: {
                display: false,
                drawBorder: false,
                drawOnChartArea: false,
                drawTicks: false,
                lineWidth: 0
              },
              border: { display: false, width: 0 },
              ticks: {
                autoSkip: true,
                maxRotation: 0,
                minRotation: 0,
                display: true,
                backdropColor: "transparent",
                color: "#000000",
                padding: 5
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