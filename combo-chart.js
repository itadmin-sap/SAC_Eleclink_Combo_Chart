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

  // const collisionPlugin = {
  //   id: 'collisionPlugin',
  //   afterDatasetsDraw(chart) {
  //     const labels = [];

  //     chart.data.datasets.forEach((ds, dsIndex) => {
  //       const meta = chart.getDatasetMeta(dsIndex);
  //       if (!meta.hidden && meta.data) {
  //         meta.data.forEach((el) => {
  //           const label = el.$datalabels?.[0];
  //           if (label && label._el) {
  //             const box = label._el.getProps(['x','y','width','height'], true);
  //             labels.push({ box, label });
  //           }
  //         });
  //       }
  //     });

  //     let changed = true;
  //     let direction = 1; // alternate up/down

  //     // Keep looping until no overlaps remain
  //     while (changed) {
  //       changed = false;
  //       for (let i = 0; i < labels.length; i++) {
  //         for (let j = i + 1; j < labels.length; j++) {
  //           const a = labels[i].box;
  //           const b = labels[j].box;

  //           const overlap =
  //             a.x < b.x + b.width &&
  //             a.x + a.width > b.x &&
  //             a.y < b.y + b.height &&
  //             a.y + a.height > b.y;

  //           if (overlap) {
  //             labels[j].label.options.offset =
  //               (labels[j].label.options.offset || 0) + direction * 12;
  //             direction *= -1; // flip direction
  //             changed = true;
  //           }
  //         }
  //       }
  //     }
  //   }
  // };
  
// Register plugin globally (outside any class or dataset definition)
Chart.register({
  id: "datalabelCollisionResolver",
  afterDatasetsDraw(chart) {
    const labels = chart.$datalabels?.labels || [];
    const boxes = labels.map(l => {
      if (!l.options.display) return null;
      const b = l._el.getProps(["x", "y", "width", "height"], true);
      return { el: l._el, ...b };
    }).filter(Boolean);

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (!a || !b) continue;

        const overlap = !(a.x + a.width < b.x ||
                          b.x + b.width < a.x ||
                          a.y + a.height < b.y ||
                          b.y + b.height < a.y);

        if (overlap) {
          if (a.y < b.y) {
            b.el.options.offset += 10;
          } else {
            a.el.options.offset += 10;
          }
        }
      }
    }
  }
});



  class PerciComboChart extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });

      const host = document.createElement("div");
      Object.assign(host.style, {
        width: "100%",
        height: "100%",
        position: "relative",
        display: "block"
      });

      this._canvas = document.createElement("canvas");
      Object.assign(this._canvas.style, { width: "100%", height: "100%" });

      // Overlay (loader + empty state)
      this._overlay = document.createElement("div");
      this._overlay.innerHTML = `
        <style>
          :host { display:block; width:100%; height:100%; }

          .overlay {
            position:absolute; inset:0; z-index:10;
            display:none;
            align-items:center; justify-content:center;
            pointer-events:none;
            background: color-mix(in srgb, var(--sac-bg, #fff) 70%, transparent);
          }

          .card {
            display:flex; align-items:center; gap:10px;
            padding: 10px 14px;
            border-radius: 12px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.10);
            background: var(--sac-surface, rgba(255,255,255,0.92));
            color: var(--sac-text, #222);
            font: 13px/1.3 sans-serif;
          }

          .spinner {
            width:16px;height:16px;
            border:2px solid rgba(0,0,0,0.25);
            border-top-color: rgba(0,0,0,0.70);
            border-radius:50%;
            animation: perciSpin 0.9s linear infinite;
          }

          .msg { display:flex; flex-direction:column; gap:2px; }
          .title { font-weight: 700; font-size: 13px; }
          .sub { font-weight: 400; font-size: 12px; opacity: 0.85; }

          @keyframes perciSpin { to { transform: rotate(360deg); } }

          /* Dark mode fallback */
          @media (prefers-color-scheme: dark) {
            .overlay { background: rgba(0,0,0,0.20); }
            .card { background: rgba(28,28,28,0.92); color:#eee; }
            .spinner { border-color: rgba(255,255,255,0.28); border-top-color: rgba(255,255,255,0.85); }
          }
        </style>

        <div class="overlay" id="ov">
          <div class="card" id="card">
            <span class="spinner" id="spin"></span>
            <div class="msg" id="msg">
              <div class="title" id="t">Loading…</div>
              <div class="sub" id="s">Applying filters and rendering chart</div>
            </div>
          </div>
        </div>
      `;
      Object.assign(host.style, { minHeight: "240px" });

      host.appendChild(this._canvas);
      host.appendChild(this._overlay);
      this._shadow.appendChild(host);

      // Overlay refs
      this._ov = this._shadow.getElementById("ov");
      this._spin = this._shadow.getElementById("spin");
      this._t = this._shadow.getElementById("t");
      this._s = this._shadow.getElementById("s");


      this._chart = null;
      this._renderToken = 0;             // prevents stale hides
      this._loadingSince = 0;
      this._minLoaderMs = 250;
      this._emptyDelayMs = 600;    // wait this long before showing "No data"
      this._pollEveryMs = 50;      // poll interval

    }

    _waitForBinding(token) {
  const start = Date.now();

  return new Promise((resolve) => {
    const tick = () => {
      // If a newer update started, stop.
      if (token !== this._renderToken) return resolve(false);

      const rows = this.main?.data;
      const hasRows = Array.isArray(rows) && rows.length > 0;

      if (hasRows) return resolve(true);

      if (Date.now() - start >= this._emptyDelayMs) {
        return resolve(false);
      }

      setTimeout(tick, this._pollEveryMs);
    };

    tick();
  });
}



    _showLoading(text = "Loading…", sub = "Applying filters and rendering chart") {
      if (!this._ov) return;
      this._loadingSince = Date.now();
      this._spin.style.display = "inline-block";
      this._t.textContent = text;
      this._s.textContent = sub;
      this._ov.style.display = "flex";
    }


    _showEmpty(text = "No data", sub = "Try adjusting the story filters") {
      if (!this._ov) return;
      this._spin.style.display = "none"; // no spinner for empty state
      this._t.textContent = text;
      this._s.textContent = sub;
      this._ov.style.display = "flex";
    }

    _hideOverlay() {
      if (!this._ov) return;

      const elapsed = Date.now() - (this._loadingSince || 0);
      const wait = Math.max(0, this._minLoaderMs - elapsed);

      if (wait > 0) {
        setTimeout(() => {
          // avoid hiding if a newer render started
          this._ov.style.display = "none";
        }, wait);
      } else {
        this._ov.style.display = "none";
      }
    }


    _afterNextPaint(token) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (token === this._renderToken) this._hideOverlay();
        });
      });
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
      console.log("Source Data:", src);
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
          barColor.push("#A1C7A8");   // Day-Ahead bar (green)
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
      this._showLoading("Loading…", "Initializing chart libraries");

      loadScriptSequential(CDN_CANDIDATES)
        .then(() => loadScriptSequential(DATALABELS_CDNS))
        .then(async () => {
        const token = ++this._renderToken;
        this._showLoading("Loading…", "Initializing and fetching data");

        await this._waitForBinding(token);
        if (token !== this._renderToken) return;

        this._SourceData = { DATE: [], PRODUCT_CODE: [], PRODUCT_CATEGORY: [], CLEARING_PRICE: [], SPREAD_CAPTURE: [] };
        this._LabelData = { UniqueDate: [] };
        this._ProductListData = { Product: [], BarColour: [], LineColour: [] };

        this._updateSourceFromBinding(this.main);
        this._render();
      })

        .catch(() => {
          this._showError("Chart.js or datalabels plugin could not be loaded. Check CSP or host internally.");
        });

    }


    async onCustomWidgetAfterUpdate() {
  const token = ++this._renderToken;

  this._showLoading("Loading…", "Applying filters and fetching data");

  const ok = await this._waitForBinding(token);

  if (token !== this._renderToken) return; // stale

  // Now binding is either ready or timed out
  this._updateSourceFromBinding(this.main);

  // If still empty after grace window, show empty
  const dates = this._LabelData?.UniqueDate || [];
  const hasData = Array.isArray(dates) && dates.length > 0;

  if (!ok || !hasData) {
    this._destroy();
    // this._hideOverlay();
    // this._showEmpty("No data", "Try adjusting the story filters or date range");
    return;
  }

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
            offset: 6,
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
            xAlign: "left",
            offset: (ctx) => {
              // const chart = ctx.chart;
              // const i = ctx.dataIndex;

              // const vLine = ctx.dataset.data?.[i];
              // if (vLine == null || isNaN(vLine)) return 6;

              // // bar dataset for this product is pushed just before the line dataset
              // const barDs = chart.data.datasets?.[ctx.datasetIndex - 1];
              // const vBar = barDs?.data?.[i];

              // // if no bar, keep normal spacing
              // if (vBar == null || isNaN(vBar)) return 6;

              // const yLeft = chart.scales.y;   // bar axis
              // const yRight = chart.scales.y1; // line axis

              // const barY  = yLeft.getPixelForValue(vBar);
              // const lineY = yRight.getPixelForValue(vLine);

              // const dist = Math.abs(lineY - barY);

              // // If they're close, push the line label further away
              // if (dist < 20) return 26;
              // if (dist < 35) return 18;
              // return 6;
              const chart = ctx.chart; 
              const i = ctx.dataIndex; 
              const vLine = ctx.dataset.data?.[i]; 
              const vBar = barData?.[i]; 

              if (vLine == null || vBar == null) return "top"; 
              const yLeft = chart.scales.y.getPixelForValue(vBar); 
              const yRight = chart.scales.y1.getPixelForValue(vLine); 
              
              // Flip alignment depending on relative position
              return yRight < yLeft ? "bottom" : "top";
            },
            anchor: "end", 
            xAlign: "left", 
            offset: (ctx) => {
              const chart = ctx.chart; 
              const i = ctx.dataIndex; 
              const vLine = ctx.dataset.data?.[i]; 
              const vBar = barData?.[i]; if (vLine == null || vBar == null) return 4; 
              const yLeft = chart.scales.y.getPixelForValue(vBar); 
              const yRight = chart.scales.y1.getPixelForValue(vLine); 
              const dist = Math.abs(yRight - yLeft); 
              
              // proportional offset: closer → larger push 
              // 
              return Math.max(6, 30 - dist);

            },


              display: (ctx) => { 
                const chart = ctx.chart; 
                const i = ctx.dataIndex; 
                const vLine = ctx.dataset.data?.[i]; 
                const vBar = barData?.[i]; 
              
                if (vLine == null || vBar == null) return true;
                const yLeft = chart.scales.y.getPixelForValue(vBar); 
                const yRight = chart.scales.y1.getPixelForValue(vLine); 
                
                return Math.abs(yRight - yLeft) > 8;  
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

      const token = ++this._renderToken;   // mark this render as latest
      const dates  = this._LabelData.UniqueDate;
      const labels = dates.map(d => d);

      // If binding is empty, show empty state and destroy chart
      const hasData = Array.isArray(dates) && dates.length > 0;
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
              display: true, 
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
        plugins: [window.ChartDataLabels,datalabelCollisionResolver]
      });

      // Fallback: ensure loader hides after canvas has actually painted
      this._afterNextPaint(token);
    }
  }
  
  customElements.define("perci-combo-chart", PerciComboChart);
})();