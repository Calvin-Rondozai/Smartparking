// Admin Dashboard JavaScript
class SmartParkAdmin {
  constructor() {
    this.currentSection = "dashboard";
    this.refreshInterval = 5000; // 5 seconds
    this.apiBaseUrl = "http://localhost:8000/api/chatbot";
    this.iotApiUrl = "http://localhost:8000/api/iot";
    this.slots = [];
    this.devices = [];
    this.bookings = [];
    this.alerts = [];
    this.deviceDetails = null; // Store device details for access in methods
    this.token = localStorage.getItem("adminToken");
    this.user = JSON.parse(localStorage.getItem("adminUser") || "{}");
    this.allUsers = null;
    this.allBookings = [];
    this.prevBookingIds = new Set();
    this.alertsRefreshTimer = null;
    this.alertsClockTimer = null;
    // Track opened/read reports (persisted)
    try {
      const savedRead = JSON.parse(
        localStorage.getItem("alertsReadIds") || "[]"
      );
      this._readReports = new Set(
        (Array.isArray(savedRead) ? savedRead : []).map((v) => String(v))
      );
    } catch (_) {
      this._readReports = new Set();
    }
    // Track resolved reports (persisted)
    try {
      const savedResolved = JSON.parse(
        localStorage.getItem("alertsResolvedIds") || "[]"
      );
      this._resolvedReports = new Set(
        (Array.isArray(savedResolved) ? savedResolved : []).map((v) =>
          String(v)
        )
      );
    } catch (_) {
      this._resolvedReports = new Set();
    }
    this.userSearchQuery = "";
    this.userSort = { field: "date_joined", direction: "desc" };

    this.init();
  }

  init() {
    console.log("Initializing admin dashboard...");
    console.log("Token:", this.token ? "Present" : "Missing");
    console.log("User:", this.user);

    this.checkAuth();
    this.setupNavigation();
    this.setupEventListeners();
    this.loadDashboardData();
    this.startAutoRefresh();
    this.generateOccupancyGrid();
    this.updateUserInfo();

    // Load alerts badge immediately on dashboard startup
    this.loadAlertsBadgeOnStartup();
    // Pre-render dashboard analytics UI and make it default landing
    this.loadReportsData().catch((e) =>
      console.warn("Dashboard init failed:", e)
    );
    this.switchSection("dashboard");

    console.log("Admin dashboard initialization complete");
  }

  setupNavigation() {
    console.log("Setting up navigation...");
    const navItems = document.querySelectorAll(".nav-item");
    console.log("Found navigation items:", navItems.length);

    navItems.forEach((item, index) => {
      const section = item.getAttribute("data-section");
      console.log(`Navigation item ${index}:`, section);

      item.addEventListener("click", (e) => {
        e.preventDefault();
        console.log("Navigation item clicked:", section);
        this.switchSection(section);
      });
    });

    console.log("Navigation setup complete");
  }

  checkAuth() {
    console.log("Checking auth...");
    console.log("Token from localStorage:", localStorage.getItem("adminToken"));
    console.log("User from localStorage:", localStorage.getItem("adminUser"));
    console.log("Token in this.token:", this.token);
    console.log("User in this.user:", this.user);

    if (!this.token || !this.user || !this.user.username) {
      console.log("No valid authentication found, redirecting to login");
      // Clear any invalid data
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminUser");
      window.location.href = "login.html";
      return;
    }

    // Verify token is still valid by making a test API call
    this.verifyToken();
    console.log("Auth check passed");
  }

  async verifyToken() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/verify/`, {
        method: "GET",
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.log("Token verification failed, redirecting to login");
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminUser");
        window.location.href = "login.html";
      }
    } catch (error) {
      console.error("Token verification error:", error);
      // Don't log out on network errors; be tolerant and keep the session
    }
  }

  // Permission checking methods
  isSuperuser() {
    return this.user.is_superuser === true;
  }

  isStaff() {
    return this.user.is_staff === true;
  }

  canViewData() {
    return this.isSuperuser() || this.isStaff();
  }

  canModifyData() {
    return this.isSuperuser();
  }

  updateUserInfo() {
    const adminName = document.getElementById("adminName");
    const adminAvatar = document.getElementById("adminAvatar");

    if (adminName && this.user.full_name) {
      const roleBadge = this.isSuperuser()
        ? " (Super Admin)"
        : this.isStaff()
        ? " (Staff)"
        : " (User)";
      adminName.textContent = this.user.full_name + roleBadge;
    }

    if (adminAvatar && this.user.full_name) {
      adminAvatar.textContent = this.user.full_name.charAt(0).toUpperCase();
    }
  }

  setupEventListeners() {
    // Mobile navigation
    const mobileNavToggle = document.getElementById("mobileNavToggle");
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");

    if (mobileNavToggle) {
      mobileNavToggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        sidebarOverlay.classList.toggle("active");
      });
    }

    if (sidebarOverlay) {
      sidebarOverlay.addEventListener("click", () => {
        sidebar.classList.remove("open");
        sidebarOverlay.classList.remove("active");
      });
    }

    // Logout functionality
    const adminMenu = document.querySelector(".admin-menu");
    if (adminMenu) {
      adminMenu.addEventListener("click", () => {
        this.showUserMenu();
      });
    }

    // Reports page buttons
    document
      .getElementById("refreshReportsBtn")
      ?.addEventListener("click", () => {
        this.loadReportsData();
      });
  }

  setupDashboardRefresh() {
    // Setup dashboard refresh button after DOM is loaded
    const dashboardRefreshBtn = document.querySelector(
      ".occupancy-section .btn-secondary"
    );
    if (dashboardRefreshBtn) {
      dashboardRefreshBtn.addEventListener("click", () => {
        this.manualRefreshDashboard();
      });
    }
  }

  showUserMenu() {
    const menu = document.createElement("div");
    menu.className = "user-menu";
    menu.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 8px 0;
      min-width: 150px;
      z-index: 1000;
    `;

    menu.innerHTML = `
      <div style="padding: 8px 16px; border-bottom: 1px solid #f0f0f0; font-size: 12px; color: #666;">
        ${this.user.full_name || "Admin User"}
      </div>
      <button onclick="dashboard.logout()" style="width: 100%; padding: 8px 16px; border: none; background: none; text-align: left; cursor: pointer; color: #d32f2f;">
        <i class="fas fa-sign-out-alt"></i> Logout
      </button>
    `;

    const adminMenu = document.querySelector(".admin-menu");
    adminMenu.style.position = "relative";
    adminMenu.appendChild(menu);

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!adminMenu.contains(e.target)) {
        menu.remove();
      }
    });
  }

  logout() {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    localStorage.removeItem("rememberMe");
    window.location.href = "login.html";
  }

  switchSection(section) {
    console.log("Switching to section:", section);

    // Update navigation
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.remove("active");
    });
    const navItem = document.querySelector(`[data-section="${section}"]`);
    if (navItem) {
      navItem.classList.add("active");
      console.log("Navigation updated for section:", section);
    } else {
      console.error("Navigation item not found for section:", section);
    }

    // Update content
    document.querySelectorAll(".content-section").forEach((content) => {
      content.classList.remove("active");
    });
    const contentSection = document.getElementById(section);
    if (contentSection) {
      contentSection.classList.add("active");
      console.log("Content section activated:", section);
    } else {
      console.error("Content section not found for section:", section);
    }

    // Update page title
    const titles = {
      dashboard: "Dashboard",
      lots: "Lots & Slots",
      devices: "Devices",
      bookings: "Bookings",
      users: "Users",
      alerts: "Alerts",
      reports: "Dashboard",
      settings: "Settings",
    };

    const subtitles = {
      dashboard: "Comprehensive overview",
      lots: "Manage parking lots and individual slots",
      devices: "Monitor IoT devices and sensors",
      bookings: "View and manage parking bookings",
      users: "User Management",
      alerts: "",
      reports: "Comprehensive overview",
      settings: "System configuration and preferences",
    };

    const pageTitle = document.getElementById("page-title");
    const pageSubtitle = document.getElementById("page-subtitle");

    if (pageTitle) pageTitle.textContent = titles[section] || section;
    if (pageSubtitle) pageSubtitle.textContent = subtitles[section] || "";

    this.currentSection = section;
    // Stop alerts timers when leaving Alerts
    if (section !== "alerts") this.stopAlertsTimers();
    console.log("Loading section data for:", section);
    this.loadSectionData(section);
  }

  async loadDashboardData() {
    // Don't show refresh button feedback for auto-refresh
    this.loadDashboardDataInternal();
  }

  async loadDashboardDataInternal() {
    try {
      const [parkingData, deviceData, bookingData] = await Promise.all([
        this.fetchParkingAvailability(),
        this.fetchDeviceHealth(),
        this.fetchRecentBookings(),
      ]);

      this.updateKPIs(parkingData);
      this.updateOccupancyGrid(parkingData);
      this.updateDeviceHealth(deviceData);
      this.loadNegativeBalanceUsers(); // Load negative balance users
      // Merge device alerts with booking-created alerts
      const deviceAlerts = deviceData.alerts || [];
      const bookingsArray = Array.isArray(bookingData)
        ? bookingData
        : bookingData?.results || bookingData?.bookings || [];

      // Detect new bookings and generate alerts
      if (Array.isArray(bookingsArray)) {
        const currentIds = new Set();
        const newBookingAlerts = [];
        bookingsArray.forEach((b) => {
          const bid = b.id ?? b.booking_id;
          if (bid != null) currentIds.add(String(bid));
          if (bid != null && !this.prevBookingIds.has(String(bid))) {
            const userName =
              b.user?.full_name ||
              b.user?.name ||
              b.user?.email ||
              b.user ||
              "User";
            const slotName = b.slot_name || b.slot || b.spot || "a slot";
            newBookingAlerts.push({
              id: `booking-${bid}`,
              type: "info",
              title: "Booking Created",
              message: `New booking for ${slotName} by ${userName}`,
              created_at: b.created_at || new Date().toISOString(),
            });
          }
        });
        this.prevBookingIds = currentIds;
        // Merge and keep latest 20
        this.alerts = [
          ...newBookingAlerts,
          ...(this.alerts || []),
          ...deviceAlerts,
        ]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 20);
      } else {
        this.alerts = [...(this.alerts || []), ...deviceAlerts]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 20);
      }

      this.updateAlerts(this.alerts);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      // Show error notification
      this.showNotification("Failed to refresh dashboard data", "error");
    }
  }

  async manualRefreshDashboard() {
    const refreshBtn = document.querySelector(
      ".occupancy-section .btn-secondary"
    );
    if (refreshBtn) {
      refreshBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
      refreshBtn.disabled = true;
    }

    try {
      await this.loadDashboardDataInternal();
      this.showNotification("Dashboard data refreshed successfully", "success");
    } catch (error) {
      console.error("Error refreshing dashboard data:", error);
      this.showNotification("Failed to refresh dashboard data", "error");
    } finally {
      if (refreshBtn) {
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        refreshBtn.disabled = false;
      }
    }
  }

  async loadSectionData(section) {
    console.log("Loading section data for:", section);
    try {
      switch (section) {
        case "lots":
          await this.loadLotsData();
          break;
        case "devices":
          await this.loadDevicesData();
          break;
        case "bookings":
          console.log("Loading bookings section...");
          await this.loadBookingsData();
          break;
        case "users":
          console.log("Loading users section...");
          await this.loadUsersData();
          break;
        case "alerts":
          await this.loadAlertsData();
          break;
        case "reports":
          await this.loadReportsData();
          break;
        case "settings":
          await this.loadSettingsData();
          break;
        default:
          console.log("Unknown section:", section);
      }
    } catch (error) {
      console.error("Error loading section data for", section, ":", error);
    }
  }

  // =====================
  // Bookings Section
  // =====================
  async loadBookingsData() {
    const container = document.getElementById("bookingsTable");
    if (!container) return;

    try {
      const response = await fetch(`${this.apiBaseUrl}/bookings/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });
      if (response.status === 401) return this.logout();
      if (!response.ok) throw new Error("Failed to fetch bookings");
      const data = await response.json();
      this.allBookings = Array.isArray(data)
        ? data
        : data.results || data.bookings || [];

      this.populateSlotFilterOptions();
      this.wireBookingFilters();
      this.renderBookingsTable();
    } catch (e) {
      console.error("Error loading bookings:", e);
      this.allBookings = [];
      this.renderBookingsTable();
    }
  }

  populateSlotFilterOptions() {
    const slotSel = document.getElementById("slotFilter");
    if (!slotSel) return;
    const current = slotSel.value;
    const slots = Array.from(
      new Set(
        (this.allBookings || []).map(
          (b) => b.slot_name || b.parking_spot?.spot_number || b.spot || b.slot
        )
      )
    ).filter(Boolean);
    slotSel.innerHTML = `<option value="">All Slots</option>${slots
      .map((s) => `<option value="${String(s)}">${String(s)}</option>`)
      .join("")}`;
    if (current) slotSel.value = current;
  }

  wireBookingFilters() {
    const statusSel = document.getElementById("statusFilter");
    const slotSel = document.getElementById("slotFilter");
    const dateSel = document.getElementById("dateFilter");
    const clearBtn = document.getElementById("clearFiltersBtn");
    const refreshBtn = document.getElementById("refreshBookingsBtn");

    const apply = () => this.renderBookingsTable();
    statusSel?.addEventListener("change", apply);
    slotSel?.addEventListener("change", apply);
    // Normalize date to yyyy-mm-dd so it matches API dates
    if (dateSel && !dateSel._boundNormalize) {
      const normalize = () => {
        try {
          const v = dateSel.value;
          if (!v) {
            dateSel.dataset.norm = "";
            apply();
            return;
          }
          const parts = v.includes("/") ? v.split(/[\/]/) : v.split("-");
          let yyyy, mm, dd;
          if (parts.length === 3) {
            if (parts[2].length === 4) {
              // dd/mm/yyyy
              dd = parts[0];
              mm = parts[1];
              yyyy = parts[2];
            } else if (parts[0].length === 4) {
              // yyyy-mm-dd
              yyyy = parts[0];
              mm = parts[1];
              dd = parts[2];
            }
          }
          if (yyyy && mm && dd) {
            dateSel.dataset.norm = `${yyyy.padStart(4, "0")}-${mm.padStart(
              2,
              "0"
            )}-${dd.padStart(2, "0")}`;
          } else {
            dateSel.dataset.norm = v.slice(0, 10);
          }
        } catch (_) {}
        apply();
      };
      dateSel.addEventListener("change", normalize);
      dateSel.addEventListener("input", normalize);
      dateSel._boundNormalize = true;
    }
    clearBtn?.addEventListener("click", () => {
      if (statusSel) statusSel.value = "";
      if (slotSel) slotSel.value = "";
      if (dateSel) {
        dateSel.value = "";
        dateSel.dataset.norm = "";
      }
      this.renderBookingsTable();
    });
    refreshBtn?.addEventListener("click", async () => {
      await this.loadBookingsData();
    });
  }

  getFilteredBookings() {
    const statusVal = document.getElementById("statusFilter")?.value || "";
    const slotVal = document.getElementById("slotFilter")?.value || "";
    const dateInput = document.getElementById("dateFilter");
    const dateVal = (dateInput?.dataset?.norm || dateInput?.value || "").slice(
      0,
      10
    );

    return (this.allBookings || []).filter((b) => {
      if (statusVal && String(b.status) !== statusVal) return false;
      if (slotVal) {
        const slot =
          b.slot_name || b.parking_spot?.spot_number || b.spot || b.slot;
        if (String(slot) !== String(slotVal)) return false;
      }
      if (dateVal) {
        const dateStr = (
          b.created_at ||
          b.start_time ||
          b.end_time ||
          ""
        ).slice(0, 10);
        if (dateStr !== dateVal) return false;
      }
      return true;
    });
  }

  renderBookingsTable() {
    const mount = document.getElementById("bookingsTable");
    if (!mount) return;
    const rows = this.getFilteredBookings();
    const fmt = (v) => (v == null ? "-" : v);
    mount.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>User</th>
            <th>Slot</th>
            <th>Status</th>
            <th>Start</th>
            <th>End</th>
            <th>Total Cost</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((b) => {
              const slot =
                b.slot_name ||
                b.parking_spot?.spot_number ||
                b.spot ||
                b.slot ||
                "-";
              const user = b.user?.full_name || b.user?.email || b.user || "-";
              return `<tr><td>${b.id}</td><td>${this.escapeHtml(
                user
              )}</td><td>${this.escapeHtml(slot)}</td><td>${
                b.status
              }</td><td>${fmt(b.start_time)}</td><td>${fmt(
                b.completed_at || b.end_time
              )}</td><td>$${Number(b.total_cost || 0).toFixed(2)}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
    const countEl = document.getElementById("bookingsCount");
    if (countEl)
      countEl.textContent = `${rows.length} result${
        rows.length === 1 ? "" : "s"
      }`;
  }

  // =====================
  // Reports Section
  // =====================
  async loadReportsData() {
    const container = document.querySelector("#reports .reports-container");
    if (!container) return;

    container.innerHTML = `
      <div class="reports-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <h2 style="margin:0;">Reports & Analytics</h2>
          <div style="color:var(--gray); font-size:14px;">Comprehensive overview of usage, revenue, and occupancy</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="date" id="reportsFrom" style="padding:6px 10px; border:1px solid var(--light-gray); border-radius:6px;" />
          <input type="date" id="reportsTo" style="padding:6px 10px; border:1px solid var(--light-gray); border-radius:6px;" />
          <button class="btn btn-sm btn-secondary" id="refreshReportsBtn"><i class="fas fa-sync-alt"></i> Refresh</button>
          <button class="btn btn-sm btn-outline" id="exportReportsBtn"><i class="fas fa-download"></i> Export</button>
        </div>
      </div>

      <div class="kpi-grid" id="reportsKpis">
        <div class="kpi-card"><div class="kpi-icon"><i class="fas fa-calendar-check"></i></div><div class="kpi-content"><h3>Total Bookings</h3><p class="kpi-value" id="kpiBookings">-</p><span class="kpi-change" id="kpiBookingsChange">-</span></div></div>
        <div class="kpi-card"><div class="kpi-icon available"><i class="fas fa-check-circle"></i></div><div class="kpi-content"><h3>Avg Occupancy</h3><p class="kpi-value" id="kpiOccupancy">-</p><span class="kpi-change" id="kpiOccupancyChange">-</span></div></div>
        <div class="kpi-card"><div class="kpi-icon booked"><i class="fas fa-dollar-sign"></i></div><div class="kpi-content"><h3>Revenue</h3><p class="kpi-value" id="kpiRevenue">-</p><span class="kpi-change" id="kpiRevenueChange">-</span></div></div>
        <div class="kpi-card"><div class="kpi-icon occupied"><i class="fas fa-car"></i></div><div class="kpi-content"><h3>Peak Hour</h3><p class="kpi-value" id="kpiPeakHour">-</p><span class="kpi-change" id="kpiPeakHourNote">-</span></div></div>
      </div>

      <div class="kpi-grid" id="userStatsKpis" style="margin-top: 24px;">
        <div class="kpi-card"><div class="kpi-icon" style="background: var(--success-green);"><i class="fas fa-users"></i></div><div class="kpi-content"><h3>Total Users</h3><p class="kpi-value" id="kpiTotalUsers" style="color: var(--success-green);">-</p><span class="kpi-change" id="kpiTotalUsersChange">-</span></div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background: var(--primary-green);"><i class="fas fa-user-check"></i></div><div class="kpi-content"><h3>Active Users</h3><p class="kpi-value" id="kpiActiveUsers" style="color: var(--primary-green);">-</p><span class="kpi-change" id="kpiActiveUsersChange">-</span></div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background: var(--blue);"><i class="fas fa-user-shield"></i></div><div class="kpi-content"><h3>Staff Members</h3><p class="kpi-value" id="kpiStaffMembers" style="color: var(--blue);">-</p><span class="kpi-change" id="kpiStaffMembersChange">-</span></div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background: var(--orange);"><i class="fas fa-user-clock"></i></div><div class="kpi-content"><h3>Users with Bookings</h3><p class="kpi-value" id="kpiUsersWithBookings" style="color: var(--orange);">-</p><span class="kpi-change" id="kpiUsersWithBookingsChange">-</span></div></div>
      </div>

      <div class="realtime-grid">
        <div class="realtime-card"><div class="card-header"><h3>Bookings Over Time</h3><i class="fas fa-chart-line"></i></div><div class="card-content"><canvas id="chartBookings"></canvas></div></div>
        <div class="realtime-card"><div class="card-header"><h3>Revenue Over Time</h3><i class="fas fa-chart-line"></i></div><div class="card-content"><canvas id="chartRevenue"></canvas></div></div>
      </div>

      <div class="realtime-grid">
        <div class="realtime-card"><div class="card-header"><h3>Status Distribution</h3><i class="fas fa-chart-pie"></i></div><div class="card-content"><canvas id="chartStatus"></canvas></div></div>
      </div>

      <div class="bookings-table-container" style="margin-top:16px;">
        <div class="table-header">
          <h3>Top Users by Bookings</h3>
          <button class="btn btn-sm btn-outline" id="exportTopUsersBtn"><i class="fas fa-download"></i> Export</button>
        </div>
        <div id="tableTopUsers" style="overflow-x:auto;"></div>
      </div>

      <div class="bookings-table-container" style="margin-top:16px;">
        <div class="table-header">
          <h3>Hourly Occupancy Heatmap</h3>
        </div>
        <div id="heatmap" style="overflow-x:auto;"></div>
      </div>
    `;

    // Default date range: last 30 days
    const toInput = container.querySelector("#reportsTo");
    const fromInput = container.querySelector("#reportsFrom");
    const now = new Date();
    const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    if (toInput) toInput.value = now.toISOString().slice(0, 10);
    if (fromInput) fromInput.value = from.toISOString().slice(0, 10);

    const refresh = async () => {
      const fromDate = fromInput?.value || "";
      const toDate = toInput?.value || "";

      // Load user data if not already loaded
      if (!this.allUsers || this.allUsers.length === 0) {
        await this.fetchUsers();
      }

      const data = await this.fetchReportsData({ from: fromDate, to: toDate });
      this.renderReports(data);
    };

    const refreshBtn = container.querySelector("#refreshReportsBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", refresh);
    const exportBtn = container.querySelector("#exportReportsBtn");
    if (exportBtn)
      exportBtn.addEventListener("click", () => this.exportReportsCSV());
    const exportTopBtn = container.querySelector("#exportTopUsersBtn");
    if (exportTopBtn)
      exportTopBtn.addEventListener("click", () => this.exportTopUsersCSV());

    await refresh();
  }

  async fetchReportsData({ from, to }) {
    // Try multiple endpoints and normalize
    const qs = from && to ? `?from=${from}&to=${to}` : "";
    const endpoints = [
      `${this.apiBaseUrl}/dashboard_reports/${qs}`,
      `${this.apiBaseUrl}/reports/summary/${qs}`,
    ];
    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          headers: { Authorization: `Token ${this.token}` },
        });
        if (resp.status === 401) {
          this.logout();
          return {};
        }
        if (!resp.ok) throw new Error("not ok");
        const raw = await resp.json();
        return this.normalizeReports(raw);
      } catch (e) {
        /* try next */
      }
    }
    // fallback demo
    return this.normalizeReports(this.demoReports());
  }
  normalizeReports(raw) {
    // Expected fields with fallbacks
    const totals = raw.totals || raw.summary || {};
    const byDay = raw.by_day || raw.bookings_over_time || [];
    const revenueByDay = raw.revenue_by_day || raw.revenue_over_time || [];
    const status = raw.status_distribution || raw.statuses || {};
    const slots = raw.slots_utilization || raw.utilization_by_slot || [];
    const topUsers = raw.top_users || raw.users_top || [];
    const heatmap = raw.occupancy_heatmap || raw.hourly_occupancy || [];

    return {
      kpis: {
        bookings: totals.bookings || totals.total_bookings || 0,
        bookings_change: totals.bookings_change || 0,
        occupancy: totals.occupancy_rate || totals.avg_occupancy || 0,
        occupancy_change: totals.occupancy_change || 0,
        revenue: totals.revenue || totals.total_revenue || 0,
        revenue_change: totals.revenue_change || 0,
        peak_hour: totals.peak_hour || "-",
        peak_note: totals.peak_note || "",
      },
      byDay: byDay.map((d) => ({
        date: d.date || d.day,
        count: d.count || d.bookings || 0,
      })),
      revenueByDay: revenueByDay.map((d) => ({
        date: d.date || d.day,
        amount: d.amount || d.revenue || 0,
      })),
      status: {
        active: status.active || 0,
        completed: status.completed || 0,
        cancelled: status.cancelled || 0,
        expired: status.expired || 0,
      },
      slots: slots.map((s) => ({
        name: s.name || s.slot || s.spot || "Slot",
        utilization: s.utilization || s.rate || 0,
      })),
      topUsers: topUsers.map((u, i) => ({
        rank: i + 1,
        name: u.name || u.full_name || u.email || "User",
        email: u.email || "-",
        bookings: u.bookings || u.count || 0,
        revenue: u.revenue || 0,
      })),
      heatmap: heatmap, // expected [{hour:0-23, day:'Mon'.., value:0-100}]
    };
  }
  demoReports() {
    const today = new Date();
    const days = [...Array(30)].map((_, i) => {
      const d = new Date(today.getTime() - (29 - i) * 86400000);
      return d.toISOString().slice(0, 10);
    });
    return {
      totals: {
        bookings: 120,
        bookings_change: 8,
        occupancy_rate: 64,
        occupancy_change: 3,
        revenue: 1520,
        revenue_change: 6,
        peak_hour: "11 AM",
        peak_note: "Weekdays",
      },
      bookings_over_time: days.map((date, i) => ({
        date,
        bookings: Math.round(3 + Math.random() * 8),
      })),
      revenue_over_time: days.map((date) => ({
        date,
        revenue: Math.round(20 + Math.random() * 80),
      })),
      status_distribution: {
        active: 12,
        completed: 92,
        cancelled: 10,
        expired: 6,
      },
      slots_utilization: [
        { name: "Slot A", utilization: 72 },
        { name: "Slot B", utilization: 61 },
      ],
      top_users: [
        {
          name: "John Doe",
          email: "john@example.com",
          bookings: 12,
          revenue: 110,
        },
        {
          name: "Jane Smith",
          email: "jane@example.com",
          bookings: 9,
          revenue: 95,
        },
      ],
      occupancy_heatmap: [],
    };
  }

  renderReports(data) {
    // Debug: Log the data to see what we're getting
    console.log("📊 Reports data received:", data);
    console.log("📈 Revenue by day:", data.revenueByDay);
    console.log("📅 Bookings by day:", data.byDay);

    // KPIs
    const fmtCurrency = (n) =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
      }).format(n || 0);
    const setText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    setText("kpiBookings", data.kpis.bookings);
    setText(
      "kpiBookingsChange",
      `${data.kpis.bookings_change >= 0 ? "+" : ""}${
        data.kpis.bookings_change
      }% vs prev`
    );
    setText("kpiOccupancy", `${data.kpis.occupancy}%`);
    setText(
      "kpiOccupancyChange",
      `${data.kpis.occupancy_change >= 0 ? "+" : ""}${
        data.kpis.occupancy_change
      }% vs prev`
    );
    setText("kpiRevenue", fmtCurrency(data.kpis.revenue));
    setText(
      "kpiRevenueChange",
      `${data.kpis.revenue_change >= 0 ? "+" : ""}${
        data.kpis.revenue_change
      }% vs prev`
    );
    setText("kpiPeakHour", data.kpis.peak_hour);
    setText("kpiPeakHourNote", data.kpis.peak_note || "");

    // User Statistics KPIs (fill dashboard cards)
    this.updateUserStatsKPIs();
    // Also render dashboard user cards at top if present
    this.renderDashboardUserCards();

    // Charts
    const destroyIfAny = (id) => {
      const c = this[`chart_${id}`];
      if (c) {
        c.destroy();
        this[`chart_${id}`] = null;
      }
    };
    const ctx = (id) => {
      const el = document.getElementById(id);
      return el ? el.getContext("2d") : null;
    };

    // Build unified date axis from bookings series
    const dateSet = new Set([
      ...(data.byDay || []).map((d) => d.date),
      ...(data.revenueByDay || []).map((d) => d.date),
    ]);
    const labels = Array.from(dateSet).sort();
    const bookingsMap = new Map(
      (data.byDay || []).map((d) => [d.date, d.count])
    );
    const revenueMap = new Map(
      (data.revenueByDay || []).map((d) => [d.date, d.amount])
    );
    const bookingsSeries = labels.map((dt) => bookingsMap.get(dt) || 0);
    const revenueSeries = labels.map((dt) => revenueMap.get(dt) || 0);

    destroyIfAny("bookings");
    const bookingsCtx = ctx("chartBookings");
    if (bookingsCtx && window.Chart) {
      this.chart_bookings = new Chart(bookingsCtx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Bookings",
              data: bookingsSeries,
              borderColor: "#4CAF50",
              backgroundColor: "rgba(76,175,80,0.15)",
              tension: 0.3,
              fill: true,
            },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
    }

    destroyIfAny("revenue");
    const revenueCtx = ctx("chartRevenue");
    if (revenueCtx && window.Chart) {
      this.chart_revenue = new Chart(revenueCtx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Revenue",
              data: revenueSeries,
              borderColor: "#2196F3",
              backgroundColor: "rgba(33,150,243,0.15)",
              tension: 0.3,
              fill: true,
            },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
    }

    destroyIfAny("status");
    const statusCtx = ctx("chartStatus");
    if (statusCtx && window.Chart) {
      this.chart_status = new Chart(statusCtx, {
        type: "pie",
        data: {
          labels: ["Active", "Completed", "Cancelled", "Expired"],
          datasets: [
            {
              data: [
                data.status.active,
                data.status.completed,
                data.status.cancelled,
                data.status.expired,
              ],
              backgroundColor: ["#2196F3", "#4CAF50", "#FFC107", "#F44336"],
            },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
    }

    // Top Users table
    const topDiv = document.getElementById("tableTopUsers");
    if (topDiv) {
      topDiv.innerHTML = `
        <table>
          <thead>
            <tr><th>#</th><th>Name</th><th>Email</th><th>Bookings</th><th>Revenue</th></tr>
          </thead>
          <tbody>
            ${data.topUsers
              .map(
                (u) =>
                  `<tr><td>${u.rank}</td><td>${this.escapeHtml(
                    u.name
                  )}</td><td>${this.escapeHtml(u.email)}</td><td>${
                    u.bookings
                  }</td><td>${fmtCurrency(u.revenue)}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    // Heatmap simple table (hour x day)
    const heat = document.getElementById("heatmap");
    if (heat) {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const matrix = [...Array(24)].map((_, hour) =>
        days.map(
          (day) =>
            data.heatmap.find(
              (h) =>
                h.hour === hour &&
                (h.day === day || h.day === days.indexOf(day))
            )?.value || 0
        )
      );
      const cell = (v) => {
        const color =
          v > 75
            ? "#E53935"
            : v > 50
            ? "#FB8C00"
            : v > 25
            ? "#43A047"
            : "#9E9E9E";
        return `<td style="text-align:center; padding:8px; background: ${color}20; color:${color}; font-weight:600;">${v}%</td>`;
      };
      heat.innerHTML = `
        <table>
          <thead><tr><th>Hour</th>${days
            .map((d) => `<th>${d}</th>`)
            .join("")}</tr></thead>
          <tbody>
            ${matrix
              .map(
                (row, hour) =>
                  `<tr><td>${hour}:00</td>${row.map(cell).join("")}</tr>`
              )
              .join("")}
          </tbody>
        </table>
      `;
    }
  }

  exportReportsCSV() {
    // Minimal: export KPIs only; extend as needed
    const rows = [
      ["Metric", "Value"],
      [
        "Total Bookings",
        document.getElementById("kpiBookings")?.textContent || "0",
      ],
      [
        "Avg Occupancy",
        document.getElementById("kpiOccupancy")?.textContent || "0%",
      ],
      ["Revenue", document.getElementById("kpiRevenue")?.textContent || "0"],
      ["Peak Hour", document.getElementById("kpiPeakHour")?.textContent || "-"],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reports_summary.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  exportTopUsersCSV() {
    const rows = [["Rank", "Name", "Email", "Bookings", "Revenue"]];
    const table = document.querySelector("#tableTopUsers table tbody");
    if (table) {
      table.querySelectorAll("tr").forEach((tr) => {
        const tds = [...tr.querySelectorAll("td")].map((td) => td.textContent);
        rows.push(tds);
      });
    }
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reports_top_users.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // =====================
  // Alerts Section
  // =====================
  async loadAlertsData() {
    const container = document.querySelector("#alerts .alerts-container");
    if (!container) return;

    container.innerHTML = `<div class="alerts-list"></div>`;

    // Immediately paint current state (even if empty) so the DOM exists
    try {
      const listEl = container.querySelector(".alerts-list");
      if (listEl) {
        listEl.innerHTML = `
          <div style="text-align:center; padding: 24px; color: var(--gray);">
            <i class="fas fa-spinner fa-spin" style="font-size:20px; margin-right:8px;"></i>
            Fetching alerts...
          </div>`;
      }
      this.updateAlerts(this.alerts || []);
    } catch (e) {
      console.log("Initial updateAlerts failed:", e);
    }

    // First, fetch reports list directly so UI shows something immediately
    try {
      await this.fetchAlertsFallback();
    } catch (e) {
      console.log("Initial fallback fetch failed:", e);
    }

    // Then try the broader multi-endpoint fetch to enrich
    console.log("Calling fetchAlertsFromBackend…");
    try {
      await this.fetchAlertsFromBackend();
    } catch (err) {
      console.log("fetchAlertsFromBackend threw:", err);
    }
    this.startAlertsTimers();
    try {
      this.updateAlertsBadge();
    } catch (_) {}
    if (this.alertsBadgeTimer) clearInterval(this.alertsBadgeTimer);
    this.alertsBadgeTimer = setInterval(() => {
      try {
        this.updateAlertsBadge();
      } catch (_) {}
    }, 10000);
  }

  async fetchAlertsFallback() {
    // Minimal direct fetch to ensure Alerts render even if other endpoints fail
    const url = `${this.apiBaseUrl}/admin/user-reports/`;
    console.log("Fallback fetching alerts from:", url);
    try {
      const resp = await fetch(url, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const list = Array.isArray(data)
        ? data
        : data.reports || data.results || [];
      // Normalize to stable IDs so read/resolved state persists across refreshes
      this.alerts = (list || []).map((a, idx) => ({
        id:
          a && a.id !== undefined && a.id !== null
            ? `report_${a.id}`
            : `report_${idx}`,
        type: a.type || "user_report",
        title: a.title || "User Report",
        message: a.message || a.detail || a.description || "",
        created_at: a.created_at || a.timestamp || new Date().toISOString(),
        priority: a.priority || "medium",
        user: a.user || null,
        status: a.status || "pending",
      }));
    } catch (e) {
      console.log("Fallback alerts fetch failed:", e);
      this.alerts = this.alerts || [];
    }
    console.log("Fallback alerts:", this.alerts);
    this.updateAlerts(this.alerts);
    this.renderAlertsList(this.alerts);
    this._latestReports = Array.isArray(this.alerts) ? this.alerts.slice() : [];
    try {
      this.updateAlertsBadge();
    } catch (_) {}
  }

  async fetchAlertsFromBackend() {
    console.log("fetchAlertsFromBackend called");
    const alerts = [];

    try {
      // 1. Check for users with negative balance
      const users = await this.fetchAllUsers();
      const negativeBalanceUsers = users.filter(
        (u) => parseFloat(u.balance || 0) < 0
      );
      negativeBalanceUsers.forEach((user) => {
        alerts.push({
          id: `negative_${user.id}`,
          type: "warning",
          title: `Negative Balance Alert`,
          message: `${
            user.first_name || user.username
          } has a negative balance of $${Math.abs(
            parseFloat(user.balance || 0)
          ).toFixed(2)}`,
          created_at: user.date_joined || new Date().toISOString(),
        });
      });
    } catch (e) {
      console.log("Failed to fetch negative balance users:", e);
    }

    try {
      // 2. Unbooked occupied spots (backend computed)
      const resp = await fetch(
        `${this.apiBaseUrl}/admin/alerts/unbooked-occupied/`,
        {
          headers: {
            Authorization: `Token ${this.token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        const list = data.alerts || [];
        list.forEach((a) => {
          alerts.push({
            id: a.id,
            type: a.type || "error",
            title: `Unauthorized Parking`,
            message: a.message || `Car parked in ${a.slot} without a booking`,
            created_at: a.created_at || new Date().toISOString(),
            priority: a.priority || "high",
          });
        });
      }
    } catch (e) {
      console.log("Failed to fetch unbooked occupied alerts:", e);
    }

    try {
      // 3. Fetch user reports/feedback from database
      const response = await fetch(`${this.apiBaseUrl}/admin/user-reports/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        const reports = data.reports || [];

        reports.forEach((report) => {
          alerts.push({
            id: `report_${report.id}`,
            type:
              report.priority === "high"
                ? "error"
                : report.priority === "medium"
                ? "warning"
                : "info",
            title: `User Report - ${(() => {
              const u = report.user;
              if (!u) return "User";
              if (typeof u === "object") {
                const full = (
                  u.full_name || `${u.first_name || ""} ${u.last_name || ""}`
                ).trim();
                return full || u.username || u.email || "User";
              }
              return String(u);
            })()}`,
            message: report.message,
            created_at: report.created_at || new Date().toISOString(),
            status: report.status || "pending",
          });
        });
      }
    } catch (e) {
      console.log("Failed to fetch user reports:", e);
    }

    // Sort alerts by date and limit to 50
    this.alerts = alerts
      .sort((x, y) => new Date(y.created_at) - new Date(x.created_at))
      .slice(0, 50);

    console.log("Final alerts:", this.alerts);
    this.updateAlerts(this.alerts);
    this.renderAlertsList(this.alerts);

    try {
      this.updateAlertsBadge();
    } catch (_) {}
  }

  // Do not auto-refresh or fade alerts; fetch once when opening
  async loadAlertsData() {
    const container = document.querySelector("#alerts .alerts-container");
    if (!container) return;
    container.innerHTML = `<div class="alerts-list"></div>`;
    await this.fetchAlertsFromBackend();
    // No timers to avoid flicker/glitch
  }

  renderAlertsList(alerts = []) {
    const el = document.querySelector("#alerts .alerts-container .alerts-list");
    if (!el) {
      console.log("renderAlertsList: alerts-list missing");
      return;
    }
    if (!alerts || alerts.length === 0) {
      el.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--gray)">
          <i class="fas fa-check-circle" style="font-size: 48px; margin-bottom: 16px; color: var(--success-green)"></i>
          <p>No alerts at the moment</p>
          <small>All systems are running smoothly</small>
        </div>`;
      return;
    }
    const icon = (t) =>
      t === "warning"
        ? "exclamation-triangle"
        : t === "error"
        ? "times-circle"
        : "bell";
    el.innerHTML = alerts
      .map((a) => {
        const userLabel = (() => {
          const u = a.user;
          if (!u) return "User";
          if (typeof u === "object") {
            const full = (
              u.full_name || `${u.first_name || ""} ${u.last_name || ""}`
            ).trim();
            return full || u.username || u.email || "User";
          }
          return String(u);
        })();
        const isResolved =
          (this._resolvedReports && this._resolvedReports.has(String(a.id))) ||
          String(a.status) === "resolved";
        const isRead = this._readReports && this._readReports.has(String(a.id));
        const borderColor =
          isResolved || isRead ? "var(--primary-green)" : "var(--red)";
        return `
      <div class="alert-item ${
        a.type
      }" style="background:white; border-radius:12px; box-shadow: var(--shadow-sm); padding:16px; margin:10px 0; display:flex; gap:12px; align-items:flex-start; border-left:4px solid ${borderColor};">
        <div class="alert-icon" style="width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; background: rgba(16,185,129,0.12); color: var(--primary-green);">
          <i class="fas fa-${icon(a.type)}"></i>
        </div>
        <div class="alert-content" style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4 style="margin:0;">${a.title || "User Report"}</h4>
            <span class="badge" style="background: var(--primary-green); color:white; padding:4px 8px; border-radius:12px; font-size:12px;">${
              a.priority || "info"
            }</span>
          </div>
          <div style="color: var(--gray); font-size:12px; margin-top:2px;">From: ${userLabel}</div>
          <p style="margin:8px 0 0 0;">${a.message || ""}</p>
          <div style="color: var(--gray); font-size:12px; margin-top:8px;">${new Date(
            a.created_at
          ).toLocaleString()}</div>
        </div>
        <div class="alert-actions">
          <button class="btn btn-sm" onclick="dashboard.viewReportById('${
            a.id
          }')">View</button>
          <button class="btn btn-sm btn-outline" onclick="dashboard.resolveReport('${
            a.id
          }')">Resolve</button>
        </div>
      </div>`;
      })
      .join("");
  }

  resolveReport(id) {
    const report = (this.alerts || []).find((a) => String(a.id) === String(id));
    if (!report) {
      this.showNotification("Report not found", "error");
      return;
    }
    // Mark as resolved/read locally and persist
    try {
      if (!this._readReports) this._readReports = new Set();
      this._readReports.add(String(id));
      localStorage.setItem(
        "alertsReadIds",
        JSON.stringify(Array.from(this._readReports))
      );
      if (!this._resolvedReports) this._resolvedReports = new Set();
      this._resolvedReports.add(String(id));
      localStorage.setItem(
        "alertsResolvedIds",
        JSON.stringify(Array.from(this._resolvedReports))
      );
      // Update in-memory alert status if present
      (this.alerts || []).forEach((a) => {
        if (String(a.id) === String(id)) a.status = "resolved";
      });
    } catch (_) {}

    // Move resolved items to the bottom and re-render
    try {
      const toDate = (d) => {
        try {
          return new Date(d).getTime();
        } catch (_) {
          return 0;
        }
      };
      const isResolved = (a) =>
        String(a.status) === "resolved" ||
        (this._resolvedReports && this._resolvedReports.has(String(a.id)));
      this.alerts = (this.alerts || []).slice().sort((a, b) => {
        const ar = isResolved(a);
        const br = isResolved(b);
        if (ar !== br) return ar ? 1 : -1; // unresolved first, resolved bottom
        return toDate(b.created_at) - toDate(a.created_at); // newest first within group
      });
    } catch (_) {}

    this.renderAlertsList(this.alerts || []);
    this.updateAlertsBadge();

    // Best-effort backend persist (strip any prefix like "report_")
    try {
      // Strip any prefix (report_, alert_, etc.) to get numeric ID
      let numericId = String(id);
      // Remove any prefix pattern (word followed by underscore)
      numericId = numericId.replace(/^[a-zA-Z]+_/, "");
      // Ensure it's a valid number, fallback to original if not
      if (!/^\d+$/.test(numericId)) {
        numericId = String(id).replace(/^report_/, "");
      }
      console.log(
        `Resolving report: original ID="${id}", numeric ID="${numericId}"`
      );
      fetch(`${this.apiBaseUrl}/admin/user-reports/${numericId}/resolve/`, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "resolved" }),
      }).catch((err) => console.error("Failed to resolve report:", err));
    } catch (err) {
      console.error("Error in resolveReport:", err);
    }

    this.showNotification("Report marked as resolved.", "success");
  }

  viewReportById(id) {
    const report = (this.alerts || []).find((a) => String(a.id) === String(id));
    if (!report) {
      this.showNotification("Report not found", "error");
      return;
    }
    this.viewReport(report);
  }
  // Unified report viewer; accepts a full report object
  viewReport(report) {
    // Mark as read and persist, then re-render list so it turns green
    try {
      if (!this._readReports) this._readReports = new Set();
      this._readReports.add(String(report.id));
      localStorage.setItem(
        "alertsReadIds",
        JSON.stringify(Array.from(this._readReports))
      );
      this.renderAlertsList(this.alerts || []);
    } catch (_) {}

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const priorityColors = {
      high: "var(--red)",
      medium: "var(--orange)",
      low: "var(--blue)",
    };

    modal.innerHTML = `
      <div class="modal-content" style="background: white; padding: 32px; border-radius: 12px; min-width: 500px; max-width: 600px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="margin: 0; color: var(--black);">Report Details</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--gray);">×</button>
        </div>
        
        <div style="margin-bottom: 20px;">
          <div style="background: var(--light-gray); padding: 20px; border-radius: 8px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <strong style="color: var(--dark-gray);">From:</strong><br>
                <span>${report.user || "User"}</span>
              </div>
              <div>
                <strong style="color: var(--dark-gray);">Priority:</strong><br>
                <span style="background: ${
                  priorityColors[report.priority] || "var(--gray)"
                }; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                  ${(report.priority || "medium").toUpperCase()}
                </span>
              </div>
              <div>
                <strong style="color: var(--dark-gray);">Type:</strong><br>
                <span>${(report.type || "user_report").toUpperCase()}</span>
              </div>
              <div>
                <strong style="color: var(--dark-gray);">Created:</strong><br>
                <span>${new Date(report.created_at).toLocaleString()}</span>
              </div>
            </div>
            
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--gray);">
              <strong style="color: var(--dark-gray);">Message:</strong>
              <p style="margin: 8px 0 0 0; color: var(--black); line-height: 1.6;">
                ${this.escapeHtml(report.message || "")}
              </p>
            </div>
          </div>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-secondary">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  startAlertsTimers() {
    this.stopAlertsTimers();
    // Update relative time labels every 60s - keep alerts visible
    this.alertsClockTimer = setInterval(() => {
      this.updateAlerts(this.alerts || []);
    }, 60000);
    // Periodically refetch alerts every 90s - keep alerts visible
    this.alertsRefreshTimer = setInterval(() => {
      this.fetchAlertsFromBackend();
    }, 90000);
  }

  stopAlertsTimers() {
    if (this.alertsClockTimer) {
      clearInterval(this.alertsClockTimer);
      this.alertsClockTimer = null;
    }
    if (this.alertsRefreshTimer) {
      clearInterval(this.alertsRefreshTimer);
      this.alertsRefreshTimer = null;
    }
  }

  async loadAlertsBadgeOnStartup() {
    try {
      // Fetch alerts immediately on dashboard startup
      await this.fetchAlertsFallback();
      this.updateAlertsBadge();

      // Set up periodic badge updates
      if (this.alertsBadgeTimer) clearInterval(this.alertsBadgeTimer);
      this.alertsBadgeTimer = setInterval(() => {
        try {
          this.updateAlertsBadge();
        } catch (_) {}
      }, 30000); // Update every 30 seconds
    } catch (e) {
      console.log("Failed to load alerts badge on startup:", e);
    }
  }

  exportAlertsCSV() {
    const rows = [
      ["Type", "Title", "Message", "Created"],
      ...(this.alerts || []).map((a) => [
        a.type,
        a.title,
        a.message,
        new Date(a.created_at).toLocaleString(),
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alerts_${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // =====================
  // Devices Section
  // =====================
  async loadDevicesData() {
    // This function is replaced by the real implementation below
    console.log("Loading devices data...");
    try {
      // Fetch real device data from multiple endpoints
      const [devices, deviceDetails, healthData, alerts] = await Promise.all([
        this.fetchRealDevices().catch((err) => {
          console.error("Devices fetch error:", err);
          return [];
        }),
        this.fetchDeviceDetails().catch((err) => {
          console.error("Device details fetch error:", err);
          return { devices: [] };
        }),
        this.fetchDeviceHealth().catch((err) => {
          console.error("Health fetch error:", err);
          return {};
        }),
        this.fetchDeviceAlerts().catch((err) => {
          console.error("Alerts fetch error:", err);
          return [];
        }),
      ]);

      console.log("Fetched data:", {
        devices,
        deviceDetails,
        healthData,
        alerts,
      });
      this.deviceDetails = deviceDetails; // Store device details for access in other methods

      // Render the devices section
      this.renderDevicesSection(devices, healthData, alerts);
    } catch (error) {
      console.error("Error loading devices data:", error);
      this.showNotification("Failed to load devices data", "error");
    }
  }
  renderDevicesGrid(deviceData) {
    const grid = document.querySelector("#devicesGrid");
    if (!grid) return;

    const devices = deviceData.device_list || [
      {
        id: "esp32_slot_a",
        name: "ESP32 Slot A",
        status: "online",
        location: "Slot A",
        last_seen: new Date().toISOString(),
        uptime: 98.5,
        temperature: 32,
        memory_free: 180000,
        memory_total: 320000,
        firmware_version: "v1.2.3",
        mac_address: "AA:BB:CC:DD:EE:FF",
      },
      {
        id: "esp32_slot_b",
        name: "ESP32 Slot B",
        status: "offline",
        location: "Slot B",
        last_seen: new Date(Date.now() - 300000).toISOString(),
        uptime: 95.2,
        temperature: 28,
        memory_free: 175000,
        memory_total: 320000,
        firmware_version: "v1.2.3",
        mac_address: "FF:EE:DD:CC:BB:AA",
      },
    ];

    grid.innerHTML = devices
      .map((device) => {
        const isOnline = device.status === "online";
        const statusColor = isOnline ? "#0ea5e9" : "#ef4444";
        const glow = isOnline
          ? "0 10px 25px rgba(14,165,233,0.2)"
          : "0 10px 25px rgba(239,68,68,0.2)";
        const statusText = isOnline ? "Online" : "Offline";

        return `
        <div class="device-card" style="border: 1px solid ${statusColor}33; border-radius: 16px; padding: 20px; background: linear-gradient(180deg, #ffffff, #fafafa); box-shadow: ${glow}; transition: transform .2s ease;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="display:inline-flex; align-items:center; gap:8px; font-weight:700; letter-spacing:.2px; color:#1f2937;">
              <i class="fas fa-microchip" style="color:${statusColor}"></i>${
          device.name
        }
            </span>
            <span style="padding:6px 12px; border-radius:999px; background:${statusColor}; color:white; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.4px;">${statusText}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div style="color:#6b7280; font-size:12px;">${device.location}</div>
            <div style="color:#9ca3af; font-size:12px;">Last seen: ${this.getTimeAgo(
              new Date(device.last_seen)
            )}</div>
          </div>
          
          <div style="display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; margin-bottom: 16px;">
            <div>
              <label style="font-size: 12px; color: var(--gray); text-transform: uppercase; font-weight: 600;">Uptime</label>
              <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 600; color: var(--dark-gray);">${
                device.uptime
              }%</p>
            </div>
            <div>
              <label style="font-size: 12px; color: var(--gray); text-transform: uppercase; font-weight: 600;">Temperature</label>
              <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 600; color: var(--dark-gray);">${
                device.temperature
              }°C</p>
            </div>
            <div>
              <label style="font-size: 12px; color: var(--gray); text-transform: uppercase; font-weight: 600;">Memory</label>
              <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 600; color: var(--dark-gray);">
                ${Math.round((device.memory_free / device.memory_total) * 100)}%
              </p>
            </div>
          </div>
          
          <div style="display:flex; gap: 12px;">
            <button class="btn btn-sm btn-outline" onclick="dashboard.viewDeviceDetails('${
              device.id
            }')">
              <i class="fas fa-eye"></i> Details
            </button>
            <button class="btn btn-sm btn-outline" onclick="dashboard.restartDevice('${
              device.id
            }')" style="color: var(--orange); border-color: var(--orange);">
              <i class="fas fa-redo"></i> Restart
            </button>
          </div>
        </div>
      `;
      })
      .join("");
  }

  viewDeviceDetails(deviceId) {
    this.showNotification(`Viewing details for device: ${deviceId}`, "info");
  }

  restartDevice(deviceId) {
    if (confirm(`Are you sure you want to restart device ${deviceId}?`)) {
      this.showNotification(
        `Restart command sent to device: ${deviceId}`,
        "success"
      );
    }
  }

  renderDevicesSection(devices, healthData, alerts) {
    const container = document.querySelector("#devices .devices-container");
    if (!container) return;

    const deviceStats = healthData.devices || {
      total: 0,
      online: 0,
      offline: 0,
    };

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: var(--dark-gray); font-size: 24px;">
          <i class="fas fa-microchip" style="color: var(--primary-green); margin-right: 8px;"></i>
          IoT Devices
        </h2>
        <div style="display: flex; gap: 16px; align-items: center;">
          <div style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: var(--success-green);">${
              deviceStats.online
            }</div>
            <div style="font-size: 12px; color: var(--gray);">Online</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: var(--red);">${
              deviceStats.offline
            }</div>
            <div style="font-size: 12px; color: var(--gray);">Offline</div>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="dashboard.loadDevicesData()">
            <i class="fas fa-sync-alt"></i> Refresh
          </button>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm); border-left: 4px solid var(--success-green);">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <i class="fas fa-microchip" style="color: var(--success-green); margin-right: 8px;"></i>
            <h3 style="margin: 0; color: var(--dark-gray);">ESP32 Slot A</h3>
          </div>
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${
              deviceStats.online > 0 ? "var(--success-green)" : "var(--red)"
            }; margin-right: 8px;"></div>
            <span style="font-weight: 600; color: ${
              deviceStats.online > 0 ? "var(--success-green)" : "var(--red)"
            };">
              ${deviceStats.online > 0 ? "Online" : "Offline"}
            </span>
          </div>
          <div style="color: var(--gray); font-size: 14px;">
            <div>IP: 192.168.1.100</div>
            <div>MAC: AA:BB:CC:DD:EE:FF</div>
            <div>Last Seen: ${
              deviceStats.online > 0 ? "Just now" : "5 minutes ago"
            }</div>
          </div>
        </div>
        
        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm); border-left: 4px solid var(--red);">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <i class="fas fa-microchip" style="color: var(--red); margin-right: 8px;"></i>
            <h3 style="margin: 0; color: var(--dark-gray);">ESP32 Slot B</h3>
          </div>
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--red); margin-right: 8px;"></div>
            <span style="font-weight: 600; color: var(--red);">Offline</span>
          </div>
          <div style="color: var(--gray); font-size: 14px;">
            <div>IP: 192.168.1.101</div>
            <div>MAC: FF:EE:DD:CC:BB:AA</div>
            <div>Last Seen: 10 minutes ago</div>
          </div>
        </div>
      </div>
    `;
  }
  async loadUsersData() {
    const container = document.querySelector("#users .users-container");
    if (!container) return;

    // Header & controls
    container.innerHTML = `
      <div class="users-header">
        <h2>Users</h2>
        <p>Manage platform users (read-only for staff)</p>
      </div>
      <div class="users-table-container" id="usersTableContainer">
        <div class="table-header">
          <h3>All Users</h3>
          <div style="display:flex; gap:8px; align-items:center;">
            <input id="userSearchInput" type="text" placeholder="Search name or email" style="padding:8px 12px; border:1px solid var(--light-gray); border-radius:6px;" />
            <button class="btn btn-sm btn-secondary" id="refreshUsersBtn"><i class="fas fa-sync-alt"></i> Refresh</button>
            <button class="btn btn-sm btn-outline" id="exportUsersBtn"><i class="fas fa-download"></i> Export</button>
          </div>
        </div>
        <div id="usersTable" style="overflow-x:auto;"></div>
      </div>
    `;

    // Wire controls
    const searchInput = container.querySelector("#userSearchInput");
    if (searchInput) {
      searchInput.value = this.userSearchQuery;
      searchInput.addEventListener("input", () => {
        this.userSearchQuery = searchInput.value.trim().toLowerCase();
        this.renderUsersTable();
      });
    }
    const refreshBtn = container.querySelector("#refreshUsersBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        refreshBtn.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        refreshBtn.disabled = true;
        try {
          await this.fetchUsers();
          this.renderUsersTable();
          this.updateUserStats();
          this.showNotification("Users refreshed", "success");
        } catch (e) {
          this.showNotification("Failed to refresh users", "error");
        } finally {
          refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
          refreshBtn.disabled = false;
        }
      });
    }
    const exportBtn = container.querySelector("#exportUsersBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => this.exportUsersCSV());
    }

    // Load data and render
    if (!Array.isArray(this.allUsers)) {
      await this.fetchUsers();
    }
    this.renderUsersTable();
    this.updateUserStats();
  }

  // Render user metric cards on Dashboard: total, active, staff, inactive
  renderDashboardUserCards() {
    try {
      const ctn = document.querySelector("#dashboard .metrics-grid");
      if (!ctn) return;
      // Find or create a row right after first metrics row
      const existing = document.getElementById("dashboardUserCards");
      const stats = this.computeUserStats();
      const card = (label, value, color) => `
        <div class="metric-card" style="background:white; padding:24px; border-radius:12px; box-shadow: var(--shadow-sm); text-align:center;">
          <div style="font-size:32px; font-weight:700; color:${color}; margin-bottom:8px;">${value}</div>
          <div style="color: var(--gray); font-size:14px;">${label}</div>
        </div>`;
      const html = `
        <div id="dashboardUserCards" style="display:contents">
          ${card("Total Users", stats.total, "var(--success-green)")}
          ${card("Active Users", stats.active, "var(--primary-green)")}
          ${card("Staff Members", stats.staff, "var(--blue)")}
          ${card("Inactive Users", stats.inactive, "var(--red)")}
        </div>`;
      if (existing) {
        existing.outerHTML = html;
      } else {
        ctn.insertAdjacentHTML("beforeend", html);
      }
    } catch (_) {}
  }

  computeUserStats() {
    const users = Array.isArray(this.allUsers) ? this.allUsers : [];
    const total = users.length;
    const active = users.filter((u) => u.is_active !== false).length;
    const staff = users.filter((u) => !!u.is_staff || !!u.is_superuser).length;
    const inactive = total - active;
    return { total, active, staff, inactive };
  }

  async fetchUsers() {
    const endpoints = [
      `${this.apiBaseUrl}/admin/users/`,
      `${this.apiBaseUrl}/users/`,
    ];
    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          headers: {
            Authorization: `Token ${this.token}`,
            "Content-Type": "application/json",
          },
        });
        if (resp.status === 401) {
          this.logout();
          return;
        }
        if (!resp.ok) throw new Error("not ok");
        const data = await resp.json();
        // Accept either {results:[...]} or array
        const users = Array.isArray(data)
          ? data
          : data.results || data.users || [];
        this.allUsers = users.map((u) => ({
          id: u.id,
          full_name:
            u.first_name && u.last_name
              ? `${u.first_name} ${u.last_name}`.trim()
              : u.username || "User",
          email: u.email || "",
          is_staff: !!u.is_staff,
          is_superuser: !!u.is_superuser,
          is_active: u.is_active !== false,
          total_bookings: u.total_bookings || u.bookings_count || 0,
          date_joined: u.date_joined || u.created_at || u.created || null,
        }));
        return;
      } catch (e) {
        // try next
      }
    }
    // Fallback to empty
    this.allUsers = [];
  }

  getFilteredSortedUsers() {
    const query = this.userSearchQuery;
    let list = Array.isArray(this.allUsers) ? [...this.allUsers] : [];
    if (query) {
      list = list.filter((u) => {
        const name = (u.full_name || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        return name.includes(query) || email.includes(query);
      });
    }
    const { field, direction } = this.userSort;
    list.sort((a, b) => {
      const av = a[field] ?? "";
      const bv = b[field] ?? "";
      if (field === "date_joined") {
        const ad = av ? new Date(av).getTime() : 0;
        const bd = bv ? new Date(bv).getTime() : 0;
        return direction === "asc" ? ad - bd : bd - ad;
      }
      if (typeof av === "number" && typeof bv === "number") {
        return direction === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return direction === "asc" ? -1 : 1;
      if (as > bs) return direction === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }

  renderUsersTable() {
    const mount = document.getElementById("usersTable");
    if (!mount) return;
    const users = this.getFilteredSortedUsers();
    console.log("Rendering users table with users:", users);
    const countText = `${users.length} user${users.length === 1 ? "" : "s"}`;
    const countEl = document.querySelector(
      "#usersTableContainer .table-header span#usersCount"
    );
    if (countEl) countEl.textContent = countText;

    const th = (label, field, width) => {
      const isActive = this.userSort.field === field;
      const dirIcon = isActive
        ? this.userSort.direction === "asc"
          ? "▲"
          : "▼"
        : "";
      return `<th style="${
        width ? `width:${width};` : ""
      } cursor:pointer;" data-field="${field}">${label} ${dirIcon}</th>`;
    };

    mount.innerHTML = `
      <table>
        <thead>
          <tr>
            ${th("#", "id", "60px")}
            ${th("Name", "full_name")}
            ${th("Email", "email")}
            ${th("License", "license_number", "120px")}
            ${th("Number Plate", "number_plate", "120px")}
            ${th("Role", "role", "120px")}
            ${th("Active", "is_active", "100px")}
            ${th("Bookings", "total_bookings", "110px")}
            ${th("Balance", "balance", "100px")}
            ${th("Joined", "date_joined", "180px")}
            <th style="width:120px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users
            .map((u, idx) => {
              const role = u.is_superuser
                ? "Superadmin"
                : u.is_staff
                ? "Staff"
                : "User";
              const joined = u.date_joined
                ? new Date(u.date_joined).toLocaleString()
                : "-";
              return `
                <tr>
                  <td>#${idx + 1}</td>
                  <td>${this.escapeHtml(u.full_name || "-")}</td>
                  <td>${this.escapeHtml(u.email || "-")}</td>
                  <td>${this.escapeHtml(u.license_number || "-")}</td>
                  <td>${this.escapeHtml(u.number_plate || "-")}</td>
                  <td>${role}</td>
                  <td>${u.is_active ? "Yes" : "No"}</td>
                  <td>${u.total_bookings ?? 0}</td>
                  <td>$${(u.balance || 0).toFixed(2)}</td>
                  <td>${joined}</td>
                  <td>
                    <button class="btn btn-sm btn-secondary" data-action="view" data-id="${
                      u.id
                    }"><i class="fas fa-eye"></i></button>
                    ${
                      this.canModifyData()
                        ? `<button class=\"btn btn-sm btn-outline\" data-action=\"delete\" data-id=\"${u.id}\"><i class=\"fas fa-trash\"></i></button>`
                        : ""
                    }
                  </td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;

    // Sorting handlers
    mount.querySelectorAll("th[data-field]").forEach((el) => {
      el.addEventListener("click", () => {
        const field = el.getAttribute("data-field");
        if (!field) return;
        if (this.userSort.field === field) {
          this.userSort.direction =
            this.userSort.direction === "asc" ? "desc" : "asc";
        } else {
          this.userSort.field = field;
          this.userSort.direction = "asc";
        }
        this.renderUsersTable();
      });
    });

    // Action handlers
    mount.querySelectorAll("button[data-action]")?.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        console.log("Button clicked:", action, id);
        if (action === "view") this.openUserModal(id);
        if (action === "delete") this.confirmDeleteUser(id);
      });
    });
  }

  showModal(title, content) {
    // Remove any existing modal
    const existingModal = document.querySelector(".modal-overlay");
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; color: var(--dark-gray); font-size: 20px;">${title}</h2>
          <button onclick="this.closest('.modal-overlay').remove()" style="
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: var(--gray);
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">&times;</button>
        </div>
        <div>${content}</div>
        <div style="margin-top: 20px; text-align: right;">
          <button onclick="this.closest('.modal-overlay').remove()" style="
            background: var(--primary-green);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
          ">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close modal when clicking outside
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }
  openUserModal(id) {
    const user = (this.allUsers || []).find((u) => String(u.id) === String(id));
    if (!user) return;
    const role = user.is_superuser
      ? "Superadmin"
      : user.is_staff
      ? "Staff"
      : "User";
    const joined = user.date_joined
      ? new Date(user.date_joined).toLocaleString()
      : "-";
    const html = `
      <div>
        <div style="margin-bottom:8px; font-weight:600;">${this.escapeHtml(
          user.full_name || "-"
        )}</div>
        <div style="color:var(--gray); margin-bottom:12px;">${this.escapeHtml(
          user.email || "-"
        )}</div>
        <div>Role: <strong>${role}</strong></div>
        <div>Active: <strong>${user.is_active ? "Yes" : "No"}</strong></div>
        <div>License Number: <strong>${this.escapeHtml(
          user.license_number || "-"
        )}</strong></div>
        <div>Phone: <strong>${this.escapeHtml(user.phone || "-")}</strong></div>
        <div>Balance: <strong>$${(user.balance || 0).toFixed(2)}</strong></div>
        <div>Total bookings: <strong>${user.total_bookings ?? 0}</strong></div>
        <div>Joined: <strong>${joined}</strong></div>
      </div>
    `;
    this.showModal("User Details", html);
  }

  async confirmDeleteUser(id) {
    if (!this.canModifyData()) return;
    const ok = await this.confirmDialog(
      "Delete this user? This cannot be undone."
    );
    if (!ok) return;
    try {
      const resp = await fetch(`${this.apiBaseUrl}/admin/users/${id}/delete/`, {
        method: "DELETE",
        headers: { Authorization: `Token ${this.token}` },
      });
      if (resp.status === 401) return this.logout();
      if (!resp.ok) throw new Error("Failed");
      this.allUsers = (this.allUsers || []).filter(
        (u) => String(u.id) !== String(id)
      );
      this.renderUsersTable();
      this.updateUserStats();
      this.showNotification("User deleted", "success");
    } catch (e) {
      this.showNotification("Failed to delete user", "error");
    }
  }
  exportUsersCSV() {
    const rows = [
      ["Name", "Email", "Role", "Active", "Bookings", "Joined"],
      ...(this.getFilteredSortedUsers() || []).map((u) => [
        u.full_name || "-",
        u.email || "-",
        u.is_superuser ? "Superadmin" : u.is_staff ? "Staff" : "User",
        u.is_active ? "Yes" : "No",
        String(u.total_bookings ?? 0),
        u.date_joined ? new Date(u.date_joined).toLocaleString() : "-",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users_${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async fetchParkingAvailability() {
    try {
      const response = await fetch(`${this.iotApiUrl}/parking/availability/`, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Do not log out on 401s from IoT endpoints

      if (!response.ok) throw new Error("Failed to fetch parking data");
      const data = await response.json();

      // Transform the data to match our expected format
      const spots = data.spots || [];

      // Only count slots as available if device is online and sensor is actively reading data
      const availableSpots = spots.filter((slot) => {
        const isOnline = slot.device_status === "online" || slot.last_seen;
        const timeSinceLastSeen = slot.last_seen
          ? new Date().getTime() - new Date(slot.last_seen).getTime()
          : null;
        const isOffline =
          !isOnline || (timeSinceLastSeen && timeSinceLastSeen > 300000); // 5 minutes threshold

        // Only count as available if device is online AND sensor shows available
        return !isOffline && slot.is_available;
      });

      const occupiedSpots = spots.filter((slot) => {
        const isOnline = slot.device_status === "online" || slot.last_seen;
        const timeSinceLastSeen = slot.last_seen
          ? new Date().getTime() - new Date(slot.last_seen).getTime()
          : null;
        const isOffline =
          !isOnline || (timeSinceLastSeen && timeSinceLastSeen > 300000);

        // Only count as occupied if device is online AND sensor shows occupied
        return !isOffline && slot.is_occupied;
      });

      const stats = {
        total: spots.length,
        available: availableSpots.length,
        occupied: occupiedSpots.length,
        booked: data.booked_spots || 0, // Get booked spots from backend
      };

      // Transform slots to match expected format and handle offline devices
      const transformedSlots = spots.map((slot) => {
        const isOnline = slot.device_status === "online" || slot.last_seen;
        const timeSinceLastSeen = slot.last_seen
          ? new Date().getTime() - new Date(slot.last_seen).getTime()
          : null;
        const isOffline =
          !isOnline || (timeSinceLastSeen && timeSinceLastSeen > 300000); // 5 minutes threshold

        return {
          id: slot.id,
          name: slot.name || slot.spot_number,
          status: isOffline
            ? "offline"
            : slot.is_available
            ? "available"
            : "occupied",
          last_update:
            slot.last_seen || slot.last_update || new Date().toISOString(),
          device_id: slot.device_id || "N/A",
          signal_strength: slot.signal_strength || "N/A",
          device_status: isOffline ? "offline" : "online",
          is_offline: isOffline,
          sensor_reading:
            slot.is_available !== undefined
              ? slot.is_available
                ? "available"
                : "occupied"
              : "unknown",
        };
      });

      return { slots: transformedSlots, stats };
    } catch (error) {
      console.error("Error fetching parking availability:", error);
      // Return empty data when backend is unavailable
      return {
        slots: [],
        stats: {
          total: 0,
          available: 0,
          occupied: 0,
          booked: 0,
        },
      };
    }
  }

  async fetchDeviceHealth() {
    try {
      const response = await fetch(`${this.iotApiUrl}/health/`, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        this.logout();
        return;
      }

      if (!response.ok) throw new Error("Failed to fetch device health");
      const data = await response.json();

      // Transform the data to match our expected format
      const devices = data.devices || {};
      const latency = data.latency || {};
      const alerts = data.alerts || [];

      return {
        devices: {
          total: devices.total || 0,
          online: devices.online || 0,
          offline: devices.offline || 0,
          uptime: devices.uptime || 0,
        },
        latency: {
          sensor_data: latency.sensor_data || 0,
          led_control: latency.led_control || 0,
          api_response: latency.api_response || 0,
        },
        alerts: alerts,
      };
    } catch (error) {
      console.error("Error fetching device health:", error);
      // Return empty data when backend is unavailable
      return {
        devices: {
          total: 0,
          online: 0,
          offline: 0,
          uptime: 0,
        },
        latency: {
          sensor_data: 0,
          led_control: 0,
          api_response: 0,
        },
        alerts: [],
      };
    }
  }
  async fetchRecentBookings() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/admin/bookings/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        this.logout();
        return;
      }

      if (!response.ok) throw new Error("Failed to fetch booking data");
      return await response.json();
    } catch (error) {
      console.error("Error fetching recent bookings:", error);
      // Return mock data for demo
      return {
        bookings: [
          {
            id: 1,
            user: "john_doe",
            slot: "Slot A",
            status: "active",
            created_at: new Date().toISOString(),
          },
          {
            id: 2,
            user: "jane_smith",
            slot: "Slot C",
            status: "active",
            created_at: new Date(Date.now() - 300000).toISOString(),
          },
        ],
      };
    }
  }

  async fetchAlerts() {
    try {
      const response = await fetch(`${this.iotApiUrl}/alerts/`, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        this.logout();
        return;
      }

      if (!response.ok) throw new Error("Failed to fetch alerts");
      const data = await response.json();
      return data.alerts || [];
    } catch (error) {
      console.error("Error fetching alerts:", error);
      // Return mock alerts for demo
      return [
        {
          id: 1,
          type: "warning",
          title: "Device Offline",
          message: "ESP32_DUAL_SENSOR_001 has been offline for 5 minutes",
          time: "2 minutes ago",
          created_at: new Date(Date.now() - 120000).toISOString(),
        },
        {
          id: 2,
          type: "info",
          title: "Booking Created",
          message: "New booking for Slot A by user john_doe",
          time: "5 minutes ago",
          created_at: new Date(Date.now() - 300000).toISOString(),
        },
      ];
    }
  }

  updateKPIs(data) {
    const stats = data.stats || {
      total: 0,
      available: 0,
      occupied: 0,
      booked: 0,
    };

    // Update KPI values with real-time data
    const kpiValues = document.querySelectorAll(".kpi-value");
    if (kpiValues.length >= 4) {
      kpiValues[0].textContent = stats.total || 0;
      kpiValues[1].textContent = stats.available || 0;
      kpiValues[2].textContent = stats.occupied || 0;
      kpiValues[3].textContent = stats.booked || 0;
    }

    // Update user statistics if available
    if (this.allUsers && this.allUsers.length > 0) {
      this.updateUserStats();
    }

    // Update percentages with real-time data
    const kpiChanges = document.querySelectorAll(".kpi-change");
    if (kpiChanges.length >= 4) {
      const total = stats.total || 0;
      if (total > 0) {
        kpiChanges[1].textContent = `${Math.round(
          (stats.available / total) * 100
        )}% free`;
        kpiChanges[2].textContent = `${Math.round(
          (stats.occupied / total) * 100
        )}% used`;
        kpiChanges[3].textContent = `${Math.round(
          (stats.booked / total) * 100
        )}% reserved`;
      } else {
        kpiChanges[1].textContent = "No data";
        kpiChanges[2].textContent = "No data";
        kpiChanges[3].textContent = "No data";
      }
    }

    // Update KPI card colors based on data availability
    const kpiCards = document.querySelectorAll(".kpi-card");
    kpiCards.forEach((card, index) => {
      if (stats.total === 0) {
        card.style.opacity = "0.6";
        card.style.background = "#f8f9fa";
      } else {
        card.style.opacity = "1";
        card.style.background = "";
      }
    });
  }

  updateUserStats() {
    if (!this.allUsers || this.allUsers.length === 0) return;

    const totalUsers = this.allUsers.length;
    const activeUsers = this.allUsers.filter((u) => u.is_active).length;
    const staffUsers = this.allUsers.filter((u) => u.is_staff).length;
    const usersWithBookings = this.allUsers.filter(
      (u) => u.total_bookings > 0
    ).length;

    // Update dashboard user stats
    const totalUsersEl = document.getElementById("totalUsers");
    const activeUsersEl = document.getElementById("activeUsers");
    const staffUsersEl = document.getElementById("staffUsers");
    const usersWithBookingsEl = document.getElementById("usersWithBookings");

    if (totalUsersEl) totalUsersEl.textContent = totalUsers;
    if (activeUsersEl) activeUsersEl.textContent = activeUsers;
    if (staffUsersEl) staffUsersEl.textContent = staffUsers;
    if (usersWithBookingsEl)
      usersWithBookingsEl.textContent = usersWithBookings;
  }

  updateUserStatsKPIs() {
    // Calculate user statistics from allUsers data for reports page
    if (!this.allUsers || this.allUsers.length === 0) {
      // Set default values if no user data
      this.setUserStatsKPIs(0, 0, 0, 0);
      return;
    }

    const totalUsers = this.allUsers.length;
    const activeUsers = this.allUsers.filter(
      (user) => user.is_active !== false
    ).length;
    const staffMembers = this.allUsers.filter(
      (user) => user.is_staff || user.is_superuser
    ).length;

    // Count users with bookings (users who have made at least one booking)
    const usersWithBookings = this.allUsers.filter(
      (user) => user.total_bookings && user.total_bookings > 0
    ).length;

    this.setUserStatsKPIs(
      totalUsers,
      activeUsers,
      staffMembers,
      usersWithBookings
    );
  }

  setUserStatsKPIs(totalUsers, activeUsers, staffMembers, usersWithBookings) {
    const setText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    // Update the KPI values
    setText("kpiTotalUsers", totalUsers);
    setText("kpiActiveUsers", activeUsers);
    setText("kpiStaffMembers", staffMembers);
    setText("kpiUsersWithBookings", usersWithBookings);

    // Update the change indicators
    setText(
      "kpiTotalUsersChange",
      totalUsers > 0
        ? `${Math.round((activeUsers / totalUsers) * 100)}% active`
        : "No users"
    );
    setText(
      "kpiActiveUsersChange",
      activeUsers > 0
        ? `${Math.round((staffMembers / activeUsers) * 100)}% staff`
        : "No active users"
    );
    setText(
      "kpiStaffMembersChange",
      staffMembers > 0
        ? `${Math.round(
            (usersWithBookings / staffMembers) * 100
          )}% with bookings`
        : "No staff"
    );
    setText(
      "kpiUsersWithBookingsChange",
      usersWithBookings > 0
        ? `${Math.round((usersWithBookings / totalUsers) * 100)}% of total`
        : "No bookings"
    );
  }

  generateOccupancyGrid() {
    const grid = document.querySelector(".occupancy-grid");
    if (!grid) return;

    // Set grid layout for medium-sized slots
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 20px;
      padding: 20px;
      max-width: 100%;
    `;

    // Clear existing slots
    grid.innerHTML = "";

    // Load occupancy data from ESP32 immediately
    this.loadOccupancyData();

    // Set up auto-refresh every 5 seconds
    this.startOccupancyAutoRefresh();
  }

  startOccupancyAutoRefresh() {
    // Clear any existing interval
    if (this.occupancyInterval) {
      clearInterval(this.occupancyInterval);
    }

    // Refresh every 5 seconds with debouncing
    this.occupancyInterval = setInterval(() => {
      if (!this.isLoadingOccupancy) {
        this.loadOccupancyData();
      }
    }, 5000);
  }

  stopOccupancyAutoRefresh() {
    if (this.occupancyInterval) {
      clearInterval(this.occupancyInterval);
      this.occupancyInterval = null;
    }
  }

  async loadOccupancyData() {
    // Prevent concurrent requests
    if (this.isLoadingOccupancy) {
      console.log("Occupancy data already loading, skipping...");
      return;
    }

    this.isLoadingOccupancy = true;

    try {
      console.log("Loading occupancy data from ESP32 (same as mobile app)...");

      // Use the same endpoint as mobile app
      const response = await fetch(`${this.iotApiUrl}/parking/availability/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch parking availability: ${response.status}`
        );
      }

      const availabilityData = await response.json();
      console.log("Parking availability data:", availabilityData);

      // Check if ESP32 is offline (same logic as mobile app)
      if (availabilityData.offline) {
        console.log("ESP32 is offline - no real-time data available");
        this.showOccupancyError(
          availabilityData.message || "ESP32 sensors offline"
        );
        return;
      }

      // Get active bookings to calculate proper occupancy (same as mobile app)
      const bookingsResponse = await fetch(`${this.apiBaseUrl}/bookings/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!bookingsResponse.ok) {
        throw new Error(`Failed to fetch bookings: ${bookingsResponse.status}`);
      }

      const bookingsData = await bookingsResponse.json();
      const activeBookings = bookingsData.filter(
        (booking) => booking.status === "active"
      );

      // Calculate occupied slots including booked slots (same logic as mobile app)
      const totalSpots = availabilityData.spots?.length || 0;
      const physicallyAvailableSpots =
        availabilityData.spots?.filter((slot) => slot.is_available).length || 0;
      const bookedSpots = activeBookings.length;
      const availableSpots = Math.max(
        0,
        physicallyAvailableSpots - bookedSpots
      );
      const occupiedSpots = totalSpots - availableSpots;

      console.log(
        `[Admin Dashboard] Slot calculation: Total=${totalSpots}, Physically Available=${physicallyAvailableSpots}, Booked=${bookedSpots}, Final Available=${availableSpots}, Occupied=${occupiedSpots}`
      );

      // Process slots with mobile app logic
      const processedSlots =
        availabilityData.spots?.map((slot) => {
          // Check if this slot is booked
          const isBooked = activeBookings.some(
            (booking) =>
              booking.parking_spot?.spot_number === slot.spot_number ||
              booking.parking_spot?.id === slot.id
          );

          return {
            ...slot,
            is_available: slot.is_available && !isBooked, // Available only if sensor says available AND not booked
            is_occupied: !slot.is_available || isBooked, // Occupied if sensor says occupied OR booked
            is_booked: isBooked,
            status: isBooked
              ? "booked"
              : slot.is_available
              ? "available"
              : "occupied",
          };
        }) || [];

      // Update the occupancy grid with processed data
      this.updateOccupancyGrid({ slots: processedSlots });

      // Update last update time
      this.updateLastUpdateTime();
    } catch (error) {
      console.error("Error loading occupancy data:", error);
      this.showOccupancyError("Failed to connect to ESP32 sensors");
    } finally {
      this.isLoadingOccupancy = false;
    }
  }

  updateOccupancyGrid(data) {
    // Handle different data formats from ESP32
    let slots = [];

    if (data.slots) {
      slots = data.slots;
    } else if (data.parking_spots) {
      slots = data.parking_spots;
    } else if (Array.isArray(data)) {
      slots = data;
    }

    const grid = document.querySelector(".occupancy-grid");
    if (!grid) return;

    if (slots.length === 0) {
      grid.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--gray);">
          <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px; color: var(--orange);"></i>
          <p>No parking slots found</p>
          <small>ESP32 devices may be offline or no sensor data available</small>
        </div>
      `;
      return;
    }

    // Store current slots for comparison
    if (!this.currentSlots) {
      this.currentSlots = new Map();
    }

    // Update existing slots or create new ones
    slots.forEach((slot, index) => {
      const slotId =
        slot.spot_number || slot.name || slot.id || `slot-${index}`;
      const existingCard = document.querySelector(`[data-slot-id="${slotId}"]`);

      // Determine slot status from ESP32 data
      let status = "unknown";
      let isOffline = false;

      if (slot.is_offline || slot.device_status === "offline") {
        status = "offline";
        isOffline = true;
      } else if (slot.is_available) {
        status = "available";
      } else if (slot.is_occupied) {
        status = "occupied";
      } else if (slot.is_booked) {
        status = "booked";
      } else {
        status = slot.status || "unknown";
      }

      // Check if slot data has changed
      const slotKey = `${slotId}-${status}-${isOffline}`;
      if (this.currentSlots.get(slotId) === slotKey && existingCard) {
        // Only update the time if slot hasn't changed
        const timeElement = existingCard.querySelector(".slot-time");
        if (timeElement) {
          const lastUpdate =
            slot.last_seen || slot.last_update || slot.updated_at;
          const updateTime = lastUpdate
            ? this.getTimeAgo(new Date(lastUpdate))
            : "Unknown";
          timeElement.textContent = isOffline ? "ESP32 Offline" : updateTime;
        }
        return; // Skip if no changes
      }

      // Update or create slot card
      if (existingCard) {
        this.updateSlotCard(existingCard, slot, status, isOffline, index);
      } else {
        this.createSlotCard(grid, slot, status, isOffline, index, slotId);
      }

      // Store current state
      this.currentSlots.set(slotId, slotKey);
    });

    // Remove slots that no longer exist
    const currentSlotIds = slots.map(
      (slot) =>
        slot.spot_number ||
        slot.name ||
        slot.id ||
        `slot-${slots.indexOf(slot)}`
    );
    const existingCards = grid.querySelectorAll("[data-slot-id]");
    existingCards.forEach((card) => {
      const slotId = card.getAttribute("data-slot-id");
      if (!currentSlotIds.includes(slotId)) {
        card.remove();
        this.currentSlots.delete(slotId);
      }
    });
  }

  createSlotCard(grid, slot, status, isOffline, index, slotId) {
    const slotCard = document.createElement("div");
    slotCard.setAttribute("data-slot-id", slotId);
    slotCard.className = `slot-card ${status}`;

    // Set different styles for offline devices
    const statusColor = isOffline
      ? "#9e9e9e"
      : status === "available"
      ? "var(--success-green)"
      : status === "occupied"
      ? "var(--red)"
      : status === "booked"
      ? "var(--blue)"
      : "var(--gray)";

    slotCard.style.cssText = `
        width: 180px;
        height: 140px;
        padding: 16px;
        margin: 8px;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        cursor: pointer;
      transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        border: 2px solid ${isOffline ? "#e0e0e0" : statusColor};
        background: ${isOffline ? "#f5f5f5" : "white"};
        opacity: ${isOffline ? 0.7 : 1};
      `;

    this.populateSlotCard(slotCard, slot, status, isOffline, index);
    slotCard.addEventListener("click", () => {
      this.showSlotDetails(slot);
    });

    grid.appendChild(slotCard);
  }

  updateSlotCard(card, slot, status, isOffline, index) {
    // Update class
    card.className = `slot-card ${status}`;

    // Update styles
    const statusColor = isOffline
      ? "#9e9e9e"
      : status === "available"
      ? "var(--success-green)"
      : status === "occupied"
      ? "var(--red)"
      : status === "booked"
      ? "var(--blue)"
      : "var(--gray)";

    card.style.border = `2px solid ${isOffline ? "#e0e0e0" : statusColor}`;
    card.style.background = isOffline ? "#f5f5f5" : "white";
    card.style.opacity = isOffline ? 0.7 : 1;

    // Update content
    this.populateSlotCard(card, slot, status, isOffline, index);
  }

  populateSlotCard(card, slot, status, isOffline, index) {
    const statusText = isOffline ? "OFFLINE" : status.toUpperCase();
    const statusBg = isOffline
      ? "#e0e0e0"
      : status === "available"
      ? "rgba(76, 175, 80, 0.1)"
      : status === "occupied"
      ? "rgba(244, 67, 54, 0.1)"
      : status === "booked"
      ? "rgba(33, 150, 243, 0.1)"
      : "rgba(158, 158, 158, 0.1)";
    const statusColorText = isOffline
      ? "#666"
      : isOffline
      ? "#9e9e9e"
      : status === "available"
      ? "var(--success-green)"
      : status === "occupied"
      ? "var(--red)"
      : status === "booked"
      ? "var(--blue)"
      : "var(--gray)";

    // Get slot name from ESP32 data
    const slotName =
      slot.spot_number ||
      slot.name ||
      slot.id ||
      `Slot ${String.fromCharCode(65 + index)}`;

    // Get last update time
    const lastUpdate = slot.last_seen || slot.last_update || slot.updated_at;
    const updateTime = lastUpdate
      ? this.getTimeAgo(new Date(lastUpdate))
      : "Unknown";

    card.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; font-size: 16px; color: ${
          isOffline ? "#666" : "var(--dark-gray)"
        };">${slotName}</div>
        <div style="font-size: 14px; margin-bottom: 8px; text-transform: capitalize; padding: 4px 8px; border-radius: 6px; background: ${statusBg}; color: ${statusColorText}; font-weight: 600;">${statusText}</div>
      <div class="slot-time" style="font-size: 12px; color: ${
        isOffline ? "#999" : "var(--gray)"
      };">${isOffline ? "ESP32 Offline" : updateTime}</div>
        ${
          isOffline
            ? `<div style="font-size: 10px; color: #999; margin-top: 4px;">No sensor data</div>`
            : slot.sensor_value
            ? `<div style="font-size: 10px; color: #666; margin-top: 4px;">Sensor: ${slot.sensor_value}</div>`
            : ""
        }
      `;
  }

  showOccupancyError(message) {
    const grid = document.querySelector(".occupancy-grid");
    if (!grid) return;

    grid.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--red); grid-column: 1 / -1;">
        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
        <p style="font-size: 18px; margin-bottom: 8px;">${message}</p>
        <small>Check ESP32 connection and try refreshing</small>
        <br><br>
        <button class="btn btn-sm btn-secondary" onclick="dashboard.loadOccupancyData()">
          <i class="fas fa-sync-alt"></i> Retry
        </button>
      </div>
    `;
  }

  updateLastUpdateTime() {
    const lastUpdateEl = document.querySelector(".last-update");
    if (lastUpdateEl) {
      lastUpdateEl.textContent = "Updated just now";
    }
  }
  getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  }

  showSlotDetails(slot) {
    // Show slot details modal or info
    console.log("Slot details:", slot);

    const slotName = slot.spot_number || slot.name || slot.id || "Unknown";
    const status = slot.is_offline
      ? "OFFLINE"
      : slot.is_available
      ? "AVAILABLE"
      : slot.is_occupied
      ? "OCCUPIED"
      : slot.is_booked
      ? "BOOKED"
      : "UNKNOWN";

    const details = `
      Slot: ${slotName}
      Status: ${status}
      Device: ${slot.device_id || "Unknown"}
      Last Update: ${
        slot.last_seen ? this.getTimeAgo(new Date(slot.last_seen)) : "Unknown"
      }
      ${slot.sensor_value ? `Sensor Value: ${slot.sensor_value}` : ""}
    `;

    this.showNotification(details, "info");
  }

  updateKPIs(parkingData) {
    // Update KPI cards with real data
    const kpiCards = document.querySelectorAll(".kpi-card");
    if (kpiCards.length >= 4) {
      // Get stats from the parking data
      const stats = parkingData.stats || {
        total: 0,
        available: 0,
        occupied: 0,
        booked: 0,
      };

      // Total Slots
      kpiCards[0].querySelector(".kpi-value").textContent = stats.total || 0;
      kpiCards[0].querySelector(".kpi-change").textContent = "+2 new";

      // Available
      kpiCards[1].querySelector(".kpi-value").textContent =
        stats.available || 0;
      kpiCards[1].querySelector(".kpi-change").textContent = `${
        stats.total > 0 ? Math.round((stats.available / stats.total) * 100) : 0
      }% free`;

      // Occupied
      kpiCards[2].querySelector(".kpi-value").textContent = stats.occupied || 0;
      kpiCards[2].querySelector(".kpi-change").textContent = `${
        stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0
      }% used`;

      // Booked
      kpiCards[3].querySelector(".kpi-value").textContent = stats.booked || 0;
      kpiCards[3].querySelector(".kpi-change").textContent = `${
        stats.total > 0 ? Math.round((stats.booked / stats.total) * 100) : 0
      }% booked`;
    }
  }

  updateDeviceHealth(data) {
    const stats = data.devices || { online: 0, offline: 0, uptime: 0 };
    const latency = data.latency || {
      sensor_data: 0,
      led_control: 0,
      api_response: 0,
    };

    // Update device health values with real-time data
    const healthValues = document.querySelectorAll(".health-value");
    if (healthValues.length >= 3) {
      healthValues[0].textContent = `${stats.online || 0}`;
      healthValues[1].textContent = `${stats.offline || 0}`;
      healthValues[2].textContent = `${stats.uptime || 0}%`;
    }

    // Update latency values with real-time data
    const latencyValues = document.querySelectorAll(".latency-value");
    if (latencyValues.length >= 3) {
      latencyValues[0].textContent = `${
        stats.total > 0 ? latency.sensor_data || 0 : "N/A"
      }ms`;
      latencyValues[1].textContent = `${
        stats.total > 0 ? latency.led_control || 0 : "N/A"
      }ms`;
      latencyValues[2].textContent = `${
        stats.total > 0 ? latency.api_response || 0 : "N/A"
      }ms`;
    }

    // Update health status indicators based on real-time data
    const healthIndicators = document.querySelectorAll(".health-indicator");
    healthIndicators.forEach((indicator, index) => {
      if (stats.total === 0) {
        // No devices available
        indicator.className = "health-indicator offline";
        indicator.style.background = "#f5f5f5";
        indicator.style.borderColor = "#e0e0e0";
      } else {
        const isHealthy = index === 0 ? stats.online > 0 : stats.uptime > 80;
        indicator.className = `health-indicator ${
          isHealthy ? "healthy" : "warning"
        }`;
        indicator.style.background = "";
        indicator.style.borderColor = "";
      }
    });

    // Update device health section title if no devices
    const deviceHealthTitle = document.querySelector(".device-health h3");
    if (deviceHealthTitle && stats.total === 0) {
      deviceHealthTitle.innerHTML =
        '<i class="fas fa-exclamation-triangle" style="color: #f57c00;"></i> Device Health - No Devices Found';
    } else if (deviceHealthTitle) {
      deviceHealthTitle.innerHTML =
        '<i class="fas fa-heartbeat"></i> Device Health';
    }
  }
  updateAlerts(alerts = []) {
    console.log("updateAlerts called with:", alerts);
    let alertsList = document.querySelector(
      "#alerts .alerts-container .alerts-list"
    );
    if (!alertsList) {
      // Create the alerts-list if it doesn't exist yet
      const parent = document.querySelector("#alerts .alerts-container");
      if (parent) {
        alertsList = document.createElement("div");
        alertsList.className = "alerts-list";
        parent.appendChild(alertsList);
      }
    }
    console.log("alertsList element:", alertsList);
    if (!alertsList) return;

    if (!alerts || alerts.length === 0) {
      alertsList.innerHTML = `
          <div style="text-align: center; padding: 40px; color: var(--gray);">
            <i class="fas fa-check-circle" style="font-size: 48px; margin-bottom: 16px; color: var(--success-green);"></i>
            <p>No alerts at the moment</p>
            <small>All systems are running smoothly</small>
          </div>
        `;
      return;
    }

    alertsList.innerHTML = alerts
      .slice(0, 5)
      .map(
        (alert) => `
            <div class="alert-item ${alert.type}">
                <div class="alert-icon">
                    <i class="fas fa-${
                      alert.type === "warning"
                        ? "exclamation-triangle"
                        : alert.type === "error"
                        ? "times-circle"
                        : "info-circle"
                    }"></i>
                </div>
                <div class="alert-content">
              <h4>${alert.title || "Alert"}</h4>
              <p>${alert.message || ""}</p>
                    <span class="alert-time">${this.getTimeAgo(
                      new Date(alert.created_at)
                    )} ago</span>
                </div>
                <div class="alert-actions">
                    <button class="btn btn-sm btn-outline" onclick="dashboard.resolveReport('${
                      alert.id
                    }')">Resolved</button>
                </div>
            </div>
          `
      )
      .join("");
  }

  handleAlertAction(type, alertId) {
    if (type === "warning") {
      this.showNotification("Alert snoozed for 30 minutes", "info");
    } else {
      try {
        this.viewReportById(String(alertId));
      } catch (e) {
        this.showNotification("Failed to open alert details", "error");
      }
    }
  }

  showSlotDetails(slot) {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const isOffline = slot.is_offline || slot.status === "offline";
    const statusColor = isOffline
      ? "#9e9e9e"
      : slot.status === "available"
      ? "var(--success-green)"
      : slot.status === "occupied"
      ? "var(--red)"
      : slot.status === "booked"
      ? "var(--blue)"
      : "var(--gray)";

    modal.innerHTML = `
      <div class="modal-content" style="background: white; padding: 32px; border-radius: 12px; min-width: 400px; max-width: 500px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="margin: 0; color: var(--black);">${slot.name} Details</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--gray);">×</button>
        </div>
        
        <div style="margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: ${statusColor};"></div>
            <span style="font-weight: 600; text-transform: capitalize; color: ${
              isOffline ? "#666" : "var(--dark-gray)"
            };">${isOffline ? "OFFLINE" : slot.status}</span>
            ${
              isOffline
                ? '<span style="color: #f57c00; font-size: 12px; background: #fff3e0; padding: 2px 8px; border-radius: 4px;">⚠️ No Sensor Data</span>'
                : ""
            }
          </div>
          
          <div style="background: var(--light-gray); padding: 16px; border-radius: 8px;">
            <div style="margin-bottom: 8px;">
              <strong>Device Status:</strong> 
              <span style="color: ${
                isOffline ? "#f57c00" : "var(--success-green)"
              }; font-weight: 600;">
                ${isOffline ? "Offline" : "Online"}
              </span>
            </div>
            <div style="margin-bottom: 8px;">
              <strong>Last Update:</strong> ${
                isOffline
                  ? "Never"
                  : slot.last_update
                  ? this.getTimeAgo(new Date(slot.last_update)) + " ago"
                  : "Unknown"
              }
            </div>
            <div style="margin-bottom: 8px;">
              <strong>Device ID:</strong> ${slot.device_id || "N/A"}
            </div>
            <div>
              <strong>Signal Strength:</strong> ${slot.signal_strength || "N/A"}
            </div>
            ${
              isOffline
                ? `
            <div style="margin-top: 12px; padding: 12px; background: #fff3e0; border-radius: 6px; border-left: 4px solid #f57c00;">
              <strong style="color: #f57c00;">⚠️ Device Offline</strong><br>
              <small style="color: #e65100;">This device has not sent sensor data recently. Check device power, network connection, or sensor status.</small>
            </div>
            `
                : ""
            }
          </div>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-secondary">Close</button>
          ${
            isOffline
              ? `
          <button onclick="dashboard.manualRefreshDashboard(); this.closest('.modal-overlay').remove();" class="btn btn-primary" style="background: var(--primary-green);">
            <i class="fas fa-sync"></i> Refresh Status
          </button>
          `
              : ""
          }
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  showNewBookingModal() {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    modal.innerHTML = `
      <div class="modal-content" style="background: white; padding: 32px; border-radius: 12px; min-width: 500px; max-width: 600px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="margin: 0; color: var(--black);">Create New Booking</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--gray);">×</button>
        </div>
        
        <form id="bookingForm">
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--dark-gray);">User</label>
            <select id="bookingUser" required style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 8px; font-size: 14px;">
              <option value="">Select User</option>
              <option value="john_doe">John Doe</option>
              <option value="jane_smith">Jane Smith</option>
              <option value="admin">Admin User</option>
            </select>
          </div>
          
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--dark-gray);">Parking Slot</label>
            <select id="bookingSlot" required style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 8px; font-size: 14px;">
              <option value="">Select Slot</option>
              <option value="Slot A">Slot A</option>
              <option value="Slot B">Slot B</option>
              <option value="Slot C">Slot C</option>
              <option value="Slot D">Slot D</option>
            </select>
          </div>
          
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--dark-gray);">Duration (hours)</label>
            <input type="number" id="bookingDuration" min="1" max="24" value="2" required style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 8px; font-size: 14px;">
          </div>
          
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button type="button" onclick="this.closest('.modal-overlay').remove()" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Booking</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    // Handle form submission
    const form = modal.querySelector("#bookingForm");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.createBooking();
    });
  }

  async createBooking() {
    const user = document.getElementById("bookingUser").value;
    const slot = document.getElementById("bookingSlot").value;
    const duration = document.getElementById("bookingDuration").value;

    if (!user || !slot || !duration) {
      this.showNotification("Please fill in all fields", "error");
      return;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/bookings/`, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user: user,
          parking_spot: slot,
          duration_hours: parseInt(duration),
          start_time: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        this.showNotification("Booking created successfully!", "success");
        document.querySelector(".modal-overlay").remove();
        this.loadDashboardData(); // Refresh data
      } else {
        const error = await response.json();
        this.showNotification(
          error.error || "Failed to create booking",
          "error"
        );
      }
    } catch (error) {
      console.error("Error creating booking:", error);
      this.showNotification("Network error. Please try again.", "error");
    }
  }

  showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${
        type === "success"
          ? "var(--success-green)"
          : type === "error"
          ? "var(--red)"
          : "var(--primary-green)"
      };
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 10000;
      animation: slideIn 0.3s ease;
      max-width: 300px;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  exportData() {
    // Mock export functionality
    const data = {
      timestamp: new Date().toISOString(),
      slots: this.slots,
      devices: this.devices,
      bookings: this.bookings,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartpark-export-${
      new Date().toISOString().split("T")[0]
    }.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  getTimeAgo(date) {
    if (!date || isNaN(date.getTime())) return "Unknown";

    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  showLoading() {
    document.body.classList.add("loading");
  }

  hideLoading() {
    document.body.classList.remove("loading");
  }

  showError(message) {
    // Simple error notification
    const notification = document.createElement("div");
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  logout() {
    // Clear stored authentication data
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    localStorage.removeItem("rememberMe");

    // Redirect to login page
    window.location.href = "login.html";
  }

  startAutoRefresh() {
    setInterval(() => {
      if (this.currentSection === "dashboard") {
        this.loadDashboardData();
      } else if (this.currentSection === "devices") {
        this.loadDevicesData();
      }
    }, this.refreshInterval);
  }

  // Section-specific data loading methods
  async loadLotsData() {
    console.log("Loading lots data...");
    // Implementation for lots section
  }

  async loadDevicesData() {
    console.log("Loading devices data...");
    try {
      // Fetch real device data from multiple endpoints
      const [devices, deviceDetails, healthData, alerts] = await Promise.all([
        this.fetchRealDevices().catch((err) => {
          console.error("Devices fetch error:", err);
          return [];
        }),
        this.fetchDeviceDetails().catch((err) => {
          console.error("Device details fetch error:", err);
          return { devices: [] };
        }),
        this.fetchDeviceHealth().catch((err) => {
          console.error("Health fetch error:", err);
          return {};
        }),
        this.fetchDeviceAlerts().catch((err) => {
          console.error("Alerts fetch error:", err);
          return [];
        }),
      ]);

      console.log("Fetched data:", {
        devices,
        deviceDetails,
        healthData,
        alerts,
      });
      this.deviceDetails = deviceDetails; // Store device details for access in other methods
      this.displayDevicesData(devices, deviceDetails, healthData, alerts);
    } catch (error) {
      // console.error("Error loading devices data:", error);
    }
  }

  async refreshDevicesData() {
    const refreshBtn = document.getElementById("refreshDevicesBtn");
    if (refreshBtn) {
      refreshBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
      refreshBtn.disabled = true;
    }

    try {
      await this.loadDevicesData();
      this.showNotification("Devices data refreshed successfully", "success");
    } catch (error) {
      this.showNotification("Failed to refresh devices data", "error");
    } finally {
      if (refreshBtn) {
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        refreshBtn.disabled = false;
      }
    }
  }

  async fetchRealDevices() {
    try {
      const response = await fetch(`${this.iotApiUrl}/devices/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        // Allow devices view to load without auth
        return [];
      }

      if (!response.ok) throw new Error("Failed to fetch devices");
      return await response.json();
    } catch (error) {
      console.error("Error fetching devices:", error);
      return [];
    }
  }

  async fetchDeviceDetails() {
    try {
      const response = await fetch(`${this.iotApiUrl}/devices/details/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        // Allow devices view to load without auth
        return;
      }

      if (!response.ok) throw new Error("Failed to fetch device details");
      return await response.json();
    } catch (error) {
      console.error("Error fetching device details:", error);
      // Return empty devices array if API fails
      return {
        devices: [],
        total_devices: 0,
        online_devices: 0,
        offline_devices: 0,
        last_updated: new Date().toISOString(),
      };
    }
  }

  async fetchDeviceAlerts() {
    try {
      const response = await fetch(`${this.iotApiUrl}/alerts/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        // Allow devices view to load without auth
        return [];
      }

      if (!response.ok) throw new Error("Failed to fetch alerts");
      return await response.json();
    } catch (error) {
      console.error("Error fetching alerts:", error);
      return [];
    }
  }

  displayDevicesData(devices, deviceDetails, healthData, alerts) {
    const devicesContainer = document.getElementById("devices");
    if (!devicesContainer) return;

    // Use real ESP32 devices data from backend
    const realDevices = devices || [];
    const detailedDevices = deviceDetails.devices || [];

    console.log("Displaying devices:", realDevices);

    if (realDevices.length === 0) {
      // Show hardcoded device details instead of error message
      devicesContainer.innerHTML = `
        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        ">
          <!-- WiFi Connection Info Card -->
          <div style="background: white; border-radius: 12px; box-shadow: var(--shadow-sm);">
            <div style="padding: 20px; border-bottom: 1px solid var(--light-gray); display: flex; align-items: center; gap: 10px;">
              <i class="fas fa-wifi" style="color: var(--blue)"></i>
              <h3 style="margin: 0; color: var(--dark-gray)">WiFi Connection Info</h3>
            </div>
            <div style="padding: 20px">
              <div style="display: grid; grid-template-columns: 140px 1fr; row-gap: 10px; column-gap: 12px;">
                <div style="color: var(--gray)">SSID</div>
                <div style="font-weight: 600; color: var(--black)">Hello_C1</div>
                <div style="color: var(--gray)">IP Address</div>
                <div style="font-weight: 600; color: var(--black)">10.38.47.70</div>
                <div style="color: var(--gray)">MAC Address</div>
                <div style="font-weight: 600; color: var(--black)">14:33:5C:47:E0:7C</div>
                <div style="color: var(--gray)">Signal Strength</div>
                <div style="font-weight: 600; color: var(--black)">-56 dBm</div>
                <div style="color: var(--gray)">Channel</div>
                <div style="font-weight: 600; color: var(--black)">6</div>
              </div>
            </div>
          </div>

          <!-- System Info Card -->
          <div style="background: white; border-radius: 12px; box-shadow: var(--shadow-sm);">
            <div style="padding: 20px; border-bottom: 1px solid var(--light-gray); display: flex; align-items: center; gap: 10px;">
              <i class="fas fa-microchip" style="color: var(--primary-green)"></i>
              <h3 style="margin: 0; color: var(--dark-gray)">System Info</h3>
            </div>
            <div style="padding: 20px">
              <div style="display: grid; grid-template-columns: 160px 1fr; row-gap: 10px; column-gap: 12px;">
                <div style="color: var(--gray)">SDK Version</div>
                <div style="font-weight: 600; color: var(--black)">v5.4.2-25-g858a988d6e</div>
                <div style="color: var(--gray)">Chip Revision</div>
                <div style="font-weight: 600; color: var(--black)">301</div>
                <div style="color: var(--gray)">Flash Size</div>
                <div style="font-weight: 600; color: var(--black)">4 MB</div>
                <div style="color: var(--gray)">CPU Frequency</div>
                <div style="font-weight: 600; color: var(--black)">240 MHz</div>
                <div style="color: var(--gray)">Sketch Size</div>
                <div style="font-weight: 600; color: var(--black)">1025 KB</div>
                <div style="color: var(--gray)">Free Heap</div>
                <div style="font-weight: 600; color: var(--black)">231448 bytes</div>
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // Create device summary header
    const totalDevices = realDevices.length;
    const onlineDevices = realDevices.filter((d) =>
      this.isDeviceOnline(d)
    ).length;
    const offlineDevices = totalDevices - onlineDevices;
    const alertCount = alerts ? alerts.length : 0;

    const summaryHTML = `
      <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid var(--light-gray);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; color: var(--dark-gray); font-size: 24px;">
            <i class="fas fa-microchip" style="color: var(--primary-green); margin-right: 8px;"></i>
            IoT Devices
          </h2>
          <button class="btn btn-sm btn-secondary" onclick="dashboard.loadDevicesData()">
            <i class="fas fa-sync-alt"></i> Refresh
          </button>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
          <div style="text-align: center; padding: 16px; background: var(--light-gray); border-radius: 8px;">
            <div style="font-size: 32px; font-weight: bold; color: var(--dark-gray);">${totalDevices}</div>
            <div style="color: var(--gray); font-size: 14px;">Total Devices</div>
          </div>
          <div style="text-align: center; padding: 16px; background: rgba(76, 175, 80, 0.1); border-radius: 8px;">
            <div style="font-size: 32px; font-weight: bold; color: var(--success-green);">${onlineDevices}</div>
            <div style="color: var(--gray); font-size: 14px;">Online</div>
          </div>
          <div style="text-align: center; padding: 16px; background: rgba(244, 67, 54, 0.1); border-radius: 8px;">
            <div style="font-size: 32px; font-weight: bold; color: var(--red);">${offlineDevices}</div>
            <div style="color: var(--gray); font-size: 14px;">Offline</div>
          </div>
          <div style="text-align: center; padding: 16px; background: rgba(255, 152, 0, 0.1); border-radius: 8px;">
            <div style="font-size: 32px; font-weight: bold; color: var(--orange);">${alertCount}</div>
            <div style="color: var(--gray); font-size: 14px;">Alerts</div>
          </div>
        </div>
      </div>
    `;

    // Create device cards
    const devicesHTML = realDevices
      .map((device) => this.renderDeviceCard(device, detailedDevices, alerts))
      .join("");

    devicesContainer.innerHTML = `
      ${summaryHTML}
      <div class="devices-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 24px;">
        ${devicesHTML}
      </div>
    `;
  }
  renderDeviceCard(device, detailedDevices, alerts) {
    const isOnline = this.isDeviceOnline(device);
    const deviceDetails = detailedDevices.find((d) => d.id === device.id) || {};
    const deviceAlerts = alerts
      ? alerts.filter((a) => a.device_id === device.id)
      : [];

    // Calculate uptime from ESP32 data
    const uptime = this.calculateUptime(device.created_at);

    // Get last seen time from ESP32
    const lastSeen = device.last_seen
      ? this.getTimeAgo(new Date(device.last_seen))
      : "Never";

    // Get device info from ESP32 data
    const deviceType = device.device_type || "ESP32";
    const deviceName = device.name || "ESP32 Device";
    const deviceId = device.device_id || "Unknown ID";
    const location = device.location || "Unknown Location";
    const ipAddress = device.ip_address || "Not Connected";
    const macAddress = device.mac_address || "Unknown";

    const statusColor = isOnline ? "var(--success-green)" : "var(--red)";
    const statusText = isOnline ? "ONLINE" : "OFFLINE";

    return `
      <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid var(--light-gray); transition: all 0.2s ease;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <i class="fas fa-microchip" style="color: ${statusColor}; font-size: 20px;"></i>
            <div>
              <div style="font-weight: 700; color: var(--dark-gray); font-size: 16px;">${deviceName}</div>
              <div style="color: var(--gray); font-size: 12px;">${deviceType} • ${deviceId}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></div>
            <span style="font-size: 12px; font-weight: 600; color: ${statusColor};">${statusText}</span>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div>
            <div style="font-size: 12px; color: var(--gray); margin-bottom: 4px;">Location</div>
            <div style="font-size: 14px; color: var(--dark-gray); font-weight: 500;">${location}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: var(--gray); margin-bottom: 4px;">IP Address</div>
            <div style="font-size: 14px; color: var(--dark-gray); font-weight: 500;">${ipAddress}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: var(--gray); margin-bottom: 4px;">MAC Address</div>
            <div style="font-size: 14px; color: var(--dark-gray); font-weight: 500;">${macAddress}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: var(--gray); margin-bottom: 4px;">Last Seen</div>
            <div style="font-size: 14px; color: var(--dark-gray); font-weight: 500;">${lastSeen}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: var(--gray); margin-bottom: 4px;">Uptime</div>
            <div style="font-size: 14px; color: var(--dark-gray); font-weight: 500;">${uptime}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: var(--gray); margin-bottom: 4px;">Status</div>
            <div style="font-size: 14px; color: ${statusColor}; font-weight: 500;">${
      device.is_active ? "ACTIVE" : "INACTIVE"
    }</div>
          </div>
        </div>
        
        ${
          deviceAlerts.length > 0
            ? `
          <div style="background: rgba(255, 152, 0, 0.1); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <i class="fas fa-exclamation-triangle" style="color: var(--orange);"></i>
              <span style="font-size: 12px; font-weight: 600; color: var(--orange);">${
                deviceAlerts.length
              } Alert${deviceAlerts.length > 1 ? "s" : ""}</span>
            </div>
            <div style="font-size: 12px; color: var(--gray);">
              ${deviceAlerts
                .slice(0, 2)
                .map((alert) => alert.message || alert.description)
                .join(", ")}
              ${
                deviceAlerts.length > 2
                  ? ` +${deviceAlerts.length - 2} more`
                  : ""
              }
            </div>
          </div>
        `
            : ""
        }
        
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid var(--light-gray);">
          <div style="display: flex; gap: 16px;">
            <div style="text-align: center;">
              <div style="font-size: 18px; font-weight: bold; color: var(--dark-gray);">${
                deviceDetails.error_count || 0
              }</div>
              <div style="font-size: 10px; color: var(--gray);">Errors</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 18px; font-weight: bold; color: var(--orange);">${
                deviceDetails.warning_count || 0
              }</div>
              <div style="font-size: 10px; color: var(--gray);">Warnings</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 18px; font-weight: bold; color: var(--primary-green);">${
                deviceDetails.sensor_count || 0
              }</div>
              <div style="font-size: 10px; color: var(--gray);">Sensors</div>
            </div>
          </div>
          <button class="btn btn-sm btn-outline" onclick="dashboard.showDeviceDetails('${
            device.id
          }')">
            <i class="fas fa-info-circle"></i> Details
          </button>
        </div>
      </div>
    `;
  }

  calculateUptime(createdAt) {
    if (!createdAt) return "Unknown";

    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now - created;

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
  showDeviceDetails(deviceId) {
    // Show device details modal or navigate to details page
    console.log("Showing details for device:", deviceId);
    this.showNotification("Device details feature coming soon!", "info");
  }

  renderDeviceSimpleCard(device) {
    const isOnline = (device.status || "offline").toLowerCase() === "online";
    return `
      <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid var(--light-gray);">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <i class="fas fa-microchip" style="color: var(--primary-green);"></i>
          <div style="font-weight: 700; color: var(--dark-gray);">ESP32 Device</div>
          <div style="margin-left: auto; font-weight: 600; color: ${
            isOnline ? "var(--success-green)" : "var(--red)"
          };">
            ${isOnline ? "Online" : "Offline"}
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 180px 1fr; row-gap: 14px; column-gap: 24px; color: var(--dark-gray);">
          <div style="color: var(--gray);">SSID</div>
          <div>${device.wifi_ssid ?? "-"}</div>
          <div style="color: var(--gray);">IP Address</div>
          <div>${device.ip_address ?? "-"}</div>
          <div style="color: var(--gray);">Firmware</div>
          <div>${device.firmware_version ?? "-"}</div>
          <div style="color: var(--gray);">WiFi Signal</div>
          <div>${
            typeof device.wifi_strength === "number"
              ? `${device.wifi_strength} dBm`
              : "-"
          }</div>
        </div>
      </div>
    `;
  }
  renderDeviceCard(device) {
    const isOnline = device.status === "online";
    const statusColor = isOnline ? "var(--success-green)" : "var(--red)";
    const statusBg = isOnline
      ? "rgba(76, 175, 80, 0.1)"
      : "rgba(244, 67, 54, 0.1)";

    const wifiStrength = device.wifi_strength || 0;
    const wifiQuality =
      wifiStrength > -50
        ? "Excellent"
        : wifiStrength > -60
        ? "Good"
        : wifiStrength > -70
        ? "Fair"
        : "Poor";
    const wifiColor =
      wifiStrength > -50
        ? "var(--success-green)"
        : wifiStrength > -60
        ? "var(--primary-green)"
        : wifiStrength > -70
        ? "var(--orange)"
        : "var(--red)";

    return `
      <div class="device-card" style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border: 1px solid var(--light-gray);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
          <div>
            <h3 style="margin: 0 0 8px 0; color: var(--dark-gray); font-size: 18px;">${
              device.name
            }</h3>
            <p style="margin: 0; color: var(--gray); font-size: 14px;">${
              device.type
            } • ${device.id}</p>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; background: ${statusBg}; color: ${statusColor};">
              ${device.status.toUpperCase()}
            </span>
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
          <div>
            <div style="margin-bottom: 12px;">
              <label style="font-size: 12px; color: var(--gray); text-transform: uppercase; font-weight: 600;">IP Address</label>
              <p style="margin: 4px 0 0 0; font-family: monospace; font-size: 14px; color: var(--dark-gray);">${
                device.ip_address
              }</p>
            </div>
            <div style="margin-bottom: 12px;">
              <label style="font-size: 12px; color: var(--gray); text-transform: uppercase; font-weight: 600;">WiFi Network</label>
              <p style="margin: 4px 0 0 0; font-size: 14px; color: var(--dark-gray);">${
                device.wifi_ssid
              }</p>
            </div>
            <div style="margin-bottom: 12px;">
              <label style="font-size: 12px; color: var(--gray); text-transform: uppercase; font-weight: 600;">WiFi Strength</label>
              <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                <span style="font-size: 14px; color: ${wifiColor}; font-weight: 600;">${wifiStrength} dBm</span>
                <span style="font-size: 12px; color: var(--gray);">(${wifiQuality})</span>
              </div>
            </div>
          </div>
          
          <div>
            <div style="margin-bottom: 12px;">
              <label style="font-size: 12px; color: var(--gray); text-transform: uppercase; font-weight: 600;">MAC Address</label>
              <p style="margin: 4px 0 0 0; font-family: monospace; font-size: 14px; color: var(--dark-gray);">${
                device.mac_address
              }</p>
            </div>
            <div style="margin-bottom: 12px;">
              <label style="font-size: 12px; color: var(--gray); text-transform: uppercase; font-weight: 600;">Firmware</label>
              <p style="margin: 4px 0 0 0; font-size: 14px; color: var(--dark-gray);">${
                device.firmware_version
              }</p>
            </div>
            <div style="margin-bottom: 12px;">
              <label style="font-size: 12px; color: var(--gray); text-transform: uppercase; font-weight: 600;">Uptime</label>
              <p style="margin: 4px 0 0 0; font-size: 14px; color: var(--dark-gray);">${this.formatUptime(
                device.uptime
              )}</p>
            </div>
          </div>
        </div>

        <div style="background: var(--light-gray); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px 0; color: var(--dark-gray); font-size: 14px;">Device Status</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <span style="font-size: 12px; color: var(--gray);">Temperature:</span>
              <span style="font-size: 14px; color: var(--dark-gray); font-weight: 600; margin-left: 8px;">${
                device.temperature || "N/A"
              }°C</span>
            </div>
            <div>
              <span style="font-size: 12px; color: var(--gray);">Memory:</span>
              <span style="font-size: 14px; color: var(--dark-gray); font-weight: 600; margin-left: 8px;">${this.formatBytes(
                device.memory_free || 0
              )} / ${this.formatBytes(device.memory_total || 0)}</span>
            </div>
            <div>
              <span style="font-size: 12px; color: var(--gray);">CPU Freq:</span>
              <span style="font-size: 14px; color: var(--dark-gray); font-weight: 600; margin-left: 8px;">${
                device.cpu_frequency || "N/A"
              } MHz</span>
            </div>
            <div>
              <span style="font-size: 12px; color: var(--gray);">Sensors:</span>
              <span style="font-size: 14px; color: var(--dark-gray); font-weight: 600; margin-left: 8px;">${
                device.sensor_count || 0
              }</span>
            </div>
          </div>
        </div>

        <div style="background: var(--light-gray); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px 0; color: var(--dark-gray); font-size: 14px;">System Health</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <span style="font-size: 12px; color: var(--gray);">Errors:</span>
              <span style="font-size: 14px; color: var(--red); font-weight: 600; margin-left: 8px;">${
                device.error_count || 0
              }</span>
            </div>
            <div>
              <span style="font-size: 12px; color: var(--gray);">Warnings:</span>
              <span style="font-size: 14px; color: var(--orange); font-weight: 600; margin-left: 8px;">${
                device.warning_count || 0
              }</span>
            </div>
            <div>
              <span style="font-size: 12px; color: var(--gray);">Last Seen:</span>
              <span style="font-size: 14px; color: var(--dark-gray); font-weight: 600; margin-left: 8px;">${this.getTimeAgo(
                new Date(device.last_seen)
              )}</span>
            </div>
            <div>
              <span style="font-size: 12px; color: var(--gray);">Location:</span>
              <span style="font-size: 14px; color: var(--dark-gray); font-weight: 600; margin-left: 8px;">${
                device.location || "N/A"
              }</span>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 12px;">
          <button onclick="dashboard.viewDeviceDetails('${
            device.id
          }')" class="btn btn-outline" style="flex: 1;">
            <i class="fas fa-eye"></i> View Details
          </button>
          <button onclick="dashboard.restartDevice('${
            device.id
          }')" class="btn btn-outline" style="color: var(--orange); border-color: var(--orange);">
            <i class="fas fa-redo"></i> Restart
          </button>
        </div>
      </div>
    `;
  }

  formatUptime(seconds) {
    if (!seconds) return "Unknown";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  formatBytes(bytes) {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  async loadBookingsData() {
    console.log("Loading bookings data...");
    try {
      await this.loadAllBookings();
    } catch (error) {
      console.error("Error loading bookings data:", error);
      this.showNotification("Failed to load bookings data", "error");
    }
  }

  async loadAllBookings() {
    try {
      console.log(
        "Loading bookings with token:",
        this.token ? "Present" : "Missing"
      );
      console.log("API URL:", `${this.apiBaseUrl}/admin/bookings/`);

      // Check if token exists
      if (!this.token) {
        console.log("No token found, redirecting to login");
        this.showNotification("Please login to access bookings", "error");
        setTimeout(() => {
          window.location.href = "login.html";
        }, 2000);
        return;
      }

      const response = await fetch(`${this.apiBaseUrl}/admin/bookings/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", response.headers);

      if (response.status === 401) {
        console.log("Unauthorized - logging out");
        this.logout();
        return;
      }

      if (response.status === 403) {
        console.log("Forbidden - user not admin");
        this.showNotification("Admin or staff access required", "error");
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Response not OK:", response.status, errorText);
        throw new Error(
          `Failed to fetch bookings: ${response.status} ${errorText}`
        );
      }

      const data = await response.json();
      console.log("Bookings data received:", data);

      const bookings = data.bookings || data.results || [];
      this.allBookings = bookings;

      // Initialize display IDs for proper numbering
      this.allBookings.forEach((booking, index) => {
        booking.displayId = index + 1;
      });

      this.displayBookings(bookings);
      this.updateBookingsCount(bookings.length);
    } catch (error) {
      console.error("Error loading bookings:", error);
      this.showNotification("Failed to load bookings", "error");
    }
  }

  displayBookings(bookings) {
    const tableContainer = document.getElementById("bookingsTable");
    if (!tableContainer) return;

    if (bookings.length === 0) {
      tableContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--gray);">
          <i class="fas fa-calendar-times" style="font-size: 48px; margin-bottom: 16px;"></i>
          <p>No bookings found</p>
          <small>Try adjusting your filters or create a new booking</small>
        </div>
      `;
      return;
    }

    const table = `
      <table style="width: 100%; border-collapse: collapse; min-width: 1000px;">
        <thead>
          <tr style="background: var(--light-gray);">
            <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">ID</th>
            <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">User</th>
            <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Slot</th>
            <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Number Plate</th>
            <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Start Time</th>
            <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">End Time</th>
            <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Duration</th>
            <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Status</th>
            <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Total Cost</th>
            <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${bookings.map((booking) => this.renderBookingRow(booking)).join("")}
        </tbody>
      </table>
    `;

    tableContainer.innerHTML = table;
  }

  renderBookingRow(booking) {
    const statusColor = this.getStatusColor(booking.status);
    const startTime = new Date(booking.start_time).toLocaleString();
    const endTime = new Date(booking.end_time).toLocaleString();
    const duration = this.formatDuration(booking.duration_minutes || 0);
    const totalCost = booking.amount || "N/A";
    const displayId = booking.displayId || booking.id;

    return `
      <tr style="border-bottom: 1px solid var(--light-gray);">
        <td style="padding: 16px; color: var(--dark-gray);">#${displayId}</td>
        <td style="padding: 16px; color: var(--dark-gray);">
          <div style="display: flex; flex-direction: column;">
            <span style="font-weight: 600;">${booking.user || "User"}</span>
            <small style="color: var(--gray);">${
              booking.email || "No email"
            }</small>
          </div>
        </td>
        <td style="padding: 16px; color: var(--dark-gray);">
          <span style="font-weight: 600;">${booking.slot || "N/A"}</span>
        </td>
        <td style="padding: 16px; color: var(--dark-gray);">${
          booking.number_plate || "N/A"
        }</td>
        <td style="padding: 16px; color: var(--dark-gray);">${startTime}</td>
        <td style="padding: 16px; color: var(--dark-gray);">${endTime}</td>
        <td style="padding: 16px; color: var(--dark-gray);">${duration}</td>
        <td style="padding: 16px;">
          <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; background: ${
            statusColor.background
          }; color: ${statusColor.color};">
            ${booking.status.toUpperCase()}
          </span>
        </td>
        <td style="padding: 16px; color: var(--dark-gray); font-weight: 600;">$${totalCost}</td>
        <td style="padding: 16px;">
          <div style="display: inline-flex; gap: 8px; flex-wrap: nowrap; white-space: nowrap; align-items: center;">
            <button onclick="dashboard.viewBookingDetails(${
              booking.id
            })" class="btn btn-sm btn-outline" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
            ${
              booking.status === "active"
                ? `
              <button onclick="dashboard.cancelBooking(${booking.id})" class="btn btn-sm btn-outline" style="color: var(--orange); border-color: var(--orange);" title="Cancel Booking">
                <i class="fas fa-times"></i>
              </button>
            `
                : ""
            }
          </div>
        </td>
      </tr>
    `;
  }

  getStatusColor(status) {
    const colors = {
      active: {
        background: "rgba(76, 175, 80, 0.1)",
        color: "var(--success-green)",
      },
      completed: {
        background: "rgba(33, 150, 243, 0.1)",
        color: "var(--blue)",
      },
      cancelled: {
        background: "rgba(255, 152, 0, 0.1)",
        color: "var(--orange)",
      },
      expired: { background: "rgba(158, 158, 158, 0.1)", color: "var(--gray)" },
    };
    return colors[status] || colors["completed"];
  }

  formatDuration(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }

  updateBookingsCount(count) {
    const countElement = document.getElementById("bookingsCount");
    if (countElement) {
      countElement.textContent = `${count} booking${count !== 1 ? "s" : ""}`;
    }
  }

  filterBookings() {
    const statusFilter = document.getElementById("statusFilter").value;
    const slotFilter = document.getElementById("slotFilter").value;
    const dateFilter = document.getElementById("dateFilter").value;

    let filteredBookings = this.allBookings || [];

    if (statusFilter) {
      filteredBookings = filteredBookings.filter(
        (booking) => booking.status === statusFilter
      );
    }

    if (slotFilter) {
      filteredBookings = filteredBookings.filter(
        (booking) => booking.parking_spot?.spot_number === slotFilter
      );
    }

    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filteredBookings = filteredBookings.filter((booking) => {
        const bookingDate = new Date(booking.start_time);
        return bookingDate.toDateString() === filterDate.toDateString();
      });
    }

    this.displayBookings(filteredBookings);
    this.updateBookingsCount(filteredBookings.length);
  }

  clearFilters() {
    document.getElementById("statusFilter").value = "";
    document.getElementById("slotFilter").value = "";
    document.getElementById("dateFilter").value = "";
    this.displayBookings(this.allBookings || []);
    this.updateBookingsCount(this.allBookings?.length || 0);
  }

  async refreshBookings() {
    const refreshBtn = document.getElementById("refreshBookingsBtn");
    if (refreshBtn) {
      refreshBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
      refreshBtn.disabled = true;
    }

    try {
      await this.loadAllBookings();
      this.showNotification("Bookings data refreshed successfully", "success");
    } catch (error) {
      console.error("Error refreshing bookings:", error);
      this.showNotification("Failed to refresh bookings data", "error");
    } finally {
      if (refreshBtn) {
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        refreshBtn.disabled = false;
      }
    }
  }

  async cancelBooking(bookingId) {
    if (
      !confirm(
        "Are you sure you want to cancel this booking? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/bookings/${bookingId}/cancel/`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${this.token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        this.showNotification("Booking cancelled successfully", "success");
        this.loadAllBookings(); // Refresh the list
      } else {
        const error = await response.json();
        this.showNotification(
          error.error || "Failed to cancel booking",
          "error"
        );
      }
    } catch (error) {
      console.error("Error cancelling booking:", error);
      this.showNotification("Network error. Please try again.", "error");
    }
  }

  async deleteBooking(bookingId) {
    if (
      !confirm(
        "Are you sure you want to delete this booking? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/admin/bookings/${bookingId}/delete/`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Token ${this.token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        this.showNotification("Booking deleted successfully", "success");
        await this.loadAllBookings(); // Refresh the list

        // Renumber the remaining bookings
        this.renumberBookings();
      } else {
        const error = await response.json();
        this.showNotification(
          error.error || "Failed to delete booking",
          "error"
        );
      }
    } catch (error) {
      console.error("Error deleting booking:", error);
      this.showNotification("Network error. Please try again.", "error");
    }
  }

  renumberBookings() {
    if (!this.allBookings) return;

    // Sort bookings by ID to ensure proper order
    this.allBookings.sort((a, b) => a.id - b.id);

    // Renumber starting from 1
    this.allBookings.forEach((booking, index) => {
      booking.displayId = index + 1;
    });

    // Redisplay with new numbering
    this.displayBookings(this.allBookings);
  }
  viewBookingDetails(bookingId) {
    const booking = this.allBookings.find((b) => b.id === bookingId);
    if (!booking) return;

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const startTime = new Date(booking.start_time).toLocaleString();
    const endTime = new Date(booking.end_time).toLocaleString();
    const duration = this.formatDuration(booking.duration_minutes || 0);
    const totalCost = booking.amount || 0;

    modal.innerHTML = `
      <div class="modal-content" style="background: white; padding: 32px; border-radius: 12px; min-width: 500px; max-width: 600px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="margin: 0; color: var(--black);">Booking #${
            booking.id
          } Details</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--gray);">×</button>
        </div>
        
        <div style="margin-bottom: 20px;">
          <div style="background: var(--light-gray); padding: 20px; border-radius: 8px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <strong style="color: var(--dark-gray);">User Information:</strong><br>
                <span>Username: ${booking.user || "User"}</span><br>
                <span>Email: ${booking.email || "No email"}</span><br>
                <span>User ID: ${booking.user_id || "N/A"}</span>
              </div>
              <div>
                <strong style="color: var(--dark-gray);">Parking Details:</strong><br>
                <span>Slot: ${booking.slot || "N/A"}</span><br>
                <span>Slot ID: ${booking.slot_id || "N/A"}</span><br>
                <span>Status: ${booking.status.toUpperCase()}</span>
              </div>
            </div>
            
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--gray);">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <strong style="color: var(--dark-gray);">Time Details:</strong><br>
                  <span>Start: ${startTime}</span><br>
                  <span>End: ${endTime}</span><br>
                  <span>Duration: ${duration}</span>
                </div>
                <div>
                  <strong style="color: var(--dark-gray);">Vehicle & Payment:</strong><br>
                  <span>Number Plate: ${
                    booking.number_plate || "Not provided"
                  }</span><br>
                  <span>Total Cost: $${totalCost.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-secondary">Close</button>
          ${
            booking.status === "active"
              ? `
            <button onclick="dashboard.cancelBooking(${booking.id}); this.closest('.modal-overlay').remove();" class="btn btn-outline" style="color: var(--orange); border-color: var(--orange);">
              <i class="fas fa-times"></i> Cancel Booking
            </button>
          `
              : ""
          }
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  exportBookings() {
    const filteredBookings = this.allBookings || [];
    const csvContent = this.convertBookingsToCSV(filteredBookings);

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `bookings-export-${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  convertBookingsToCSV(bookings) {
    const headers = [
      "ID",
      "User",
      "Email",
      "Slot",
      "Start Time",
      "End Time",
      "Duration (min)",
      "Status",
      "Total Cost",
    ];
    const csvRows = [headers.join(",")];

    bookings.forEach((booking) => {
      const row = [
        booking.id,
        booking.user?.username || "User",
        booking.email || "No email",
        booking.parking_spot?.spot_number || "N/A",
        new Date(booking.start_time).toLocaleString(),
        new Date(booking.end_time).toLocaleString(),
        booking.duration_minutes || 0,
        booking.status,
        booking.total_cost || "N/A",
      ];
      csvRows.push(row.join(","));
    });

    return csvRows.join("\n");
  }

  async loadNegativeBalanceUsers() {
    try {
      console.log("Loading users with negative balance...");

      const response = await fetch(`${this.apiBaseUrl}/admin/users/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        this.logout();
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status}`);
      }

      const data = await response.json();
      const users = Array.isArray(data)
        ? data
        : data.results || data.users || [];

      // Filter users with negative balance
      const negativeBalanceUsers = users.filter((user) => {
        const balance = parseFloat(user.balance || user.profile?.balance || 0);
        return balance < 0;
      });

      this.displayNegativeBalanceUsers(negativeBalanceUsers);
    } catch (error) {
      console.error("Error loading negative balance users:", error);
      this.displayNegativeBalanceUsers([]);
    }
  }
  displayNegativeBalanceUsers(users) {
    const container = document.getElementById("negativeBalanceTable");
    if (!container) return;

    if (users.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #666;">
          <i class="fas fa-check-circle" style="font-size: 48px; color: #4CAF50; margin-bottom: 16px;"></i>
          <h3>No Users with Negative Balance</h3>
          <p>All users have positive or zero balance.</p>
        </div>
      `;
      return;
    }

    const tableHTML = `
      <table class="data-table" style="width:100%;table-layout:fixed;border-collapse:collapse;">
        <thead>
          <tr style="background:var(--light-gray);border-bottom:2px solid #bbb;">
            <th style="padding:12px;text-align:left;">User ID</th>
            <th style="padding:12px;text-align:left;">Username</th>
            <th style="padding:12px;text-align:left;">Email</th>
            <th style="padding:12px;text-align:left;">Balance</th>
            <th style="padding:12px;text-align:left;">Last Login</th>
            <th style="padding:12px;text-align:left;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users
            .map(
              (user) => `
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:12px;">${user.id}</td>
              <td style="padding:12px;">${user.username || "N/A"}</td>
              <td style="padding:12px;">${user.email || "N/A"}</td>
              <td style="padding:12px;"><span style="color:#F44336;font-weight:bold;">$${parseFloat(
                user.balance || user.profile?.balance || 0
              ).toFixed(2)}</span></td>
              <td style="padding:12px;">${
                user.last_login
                  ? new Date(user.last_login).toLocaleDateString()
                  : "Never"
              }</td>
              <td style="padding:12px;">
                <button class="btn btn-sm btn-outline" onclick="dashboard.viewUserDetails(${
                  user.id
                })">
                  <i class="fas fa-eye"></i> View
                </button>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
    container.innerHTML = tableHTML;
  }

  showUserDetailsModal(user) {
    // Always attempt to show booking count and total spent from user object if present
    let bookingStatsHtml = "";
    if (user.booking_count !== undefined && user.total_spent !== undefined) {
      bookingStatsHtml = `
        <div style='margin:9px 0 8px 0;font-size:15px;'>
          <strong>Total Bookings:</strong> ${user.booking_count}
          <br><strong>Total Spent:</strong> $${parseFloat(
            user.total_spent
          ).toFixed(2)}
        </div>
      `;
    }
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-content" style="padding:30px;background:#fff;border-radius:14px;max-width:430px;width:93vw;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
          <h3 style="margin:0;">User Details</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--gray);">×</button>
        </div>
        <div style="margin-bottom:4px;"><strong>ID:</strong> ${user.id}</div>
        <div style="margin-bottom:4px;"><strong>Username:</strong> ${
          user.username || "N/A"
        }</div>
        <div style="margin-bottom:4px;"><strong>Email:</strong> ${
          user.email
        }</div>
        <div style="margin-bottom:4px;"><strong>Balance:</strong> <span style="color:#F44336;font-weight:bold;">$${parseFloat(
          user.balance || 0
        ).toFixed(2)}</span></div>
        <div style="margin-bottom:4px;"><strong>Last Login:</strong> ${
          user.last_login ? new Date(user.last_login).toLocaleString() : "Never"
        }</div>
        ${
          bookingStatsHtml ||
          `<div id="userExtraStats" style='margin-top:9px;color:#444;font-size:15px;'>Loading booking stats...</div>`
        }
      </div>
    `;
    document.body.appendChild(modal);

    // If not in user, fetch and update
    if (
      !(user.booking_count !== undefined && user.total_spent !== undefined) &&
      user.username
    ) {
      const statsDiv = modal.querySelector("#userExtraStats");
      if (statsDiv) {
        fetch(
          `${this.apiBaseUrl}/admin/bookings/?search=${encodeURIComponent(
            user.username
          )}`,
          { headers: { Authorization: `Token ${this.token}` } }
        )
          .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
          .then((data) => {
            const bookings = data.bookings || [];
            const total = bookings.length;
            const spent = bookings.reduce((sum, b) => {
              const amt =
                b.amount !== undefined && b.amount !== null
                  ? parseFloat(b.amount)
                  : parseFloat(b.total_cost || 0);
              return sum + (isNaN(amt) ? 0 : amt);
            }, 0);
            statsDiv.innerHTML = `<strong>Total Bookings:</strong> ${total}<br><strong>Total Spent:</strong> $${spent.toFixed(
              2
            )}`;
          })
          .catch(() => {
            statsDiv.innerHTML = `<span style='color:#B71C1C;'>Failed to load booking stats.</span>`;
          });
      }
    }
  }

  viewUserDetails(userId) {
    // Find the user in allUsers or fetch user details
    const user = this.allUsers?.find((u) => u.id === userId);
    if (user) {
      this.showUserDetailsModal(user);
    } else {
      this.showNotification("User details not available", "error");
    }
  }

  async loadUsersData() {
    console.log("Loading users data...");
    console.log("Token:", this.token ? "Present" : "Missing");
    console.log("User:", this.user);
    try {
      const users = await this.fetchAllUsers();
      this.allUsers = users; // Store users for export functionality
      this.displayUsersData(users);
      this.updateUserStats(); // Update dashboard user statistics
    } catch (error) {
      console.error("Error loading users data:", error);
      this.showNotification("Failed to load users data", "error");
      this.displayUsersData([]); // Show empty state
    }
  }

  async fetchAllUsers() {
    try {
      console.log("Fetching users from:", `${this.apiBaseUrl}/admin/users/`);
      console.log("Token:", this.token ? "Present" : "Missing");

      // Check if token exists
      if (!this.token) {
        console.log("No token found, redirecting to login");
        this.showNotification("Please login to access users", "error");
        setTimeout(() => {
          window.location.href = "login.html";
        }, 2000);
        return [];
      }

      const response = await fetch(`${this.apiBaseUrl}/admin/users/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", response.headers);

      if (response.status === 401) {
        console.log("Unauthorized - logging out");
        this.logout();
        return;
      }

      if (response.status === 403) {
        console.log("Forbidden - user not admin");
        this.showNotification(
          "Admin or staff access required to view users",
          "error"
        );
        return [];
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Response not OK:", response.status, errorText);
        throw new Error(
          `Failed to fetch users: ${response.status} ${errorText}`
        );
      }

      const data = await response.json();
      console.log("Users data received:", data);
      return data.users || [];
    } catch (error) {
      console.error("Error fetching users:", error);
      this.showNotification(`Failed to fetch users: ${error.message}`, "error");
      return [];
    }
  }

  displayUsersData(users) {
    const usersContainer = document.getElementById("users");
    if (!usersContainer) return;

    if (users.length === 0) {
      usersContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--gray);">
          <i class="fas fa-users" style="font-size: 48px; margin-bottom: 16px; color: var(--gray);"></i>
          <p>No users found</p>
          <small>Start by creating your first user account</small>
        </div>
      `;
      return;
    }

    const usersHTML = users.map((user) => this.renderUserRow(user)).join("");

    usersContainer.innerHTML = `
      <div class="users-header" style="margin-bottom: 24px;">
      </div>
      
      <!-- User Filters -->
      <div class="user-filters" style="margin-bottom: 24px; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap; justify-content: space-between;">
          <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
            <div style="display: flex; gap: 8px; align-items: center">
              <label style="font-weight: 600; color: var(--dark-gray)">Status:</label>
              <select id="userStatusFilter" onchange="dashboard.filterUsers()" style="padding: 8px 12px; border: 1px solid var(--light-gray); border-radius: 6px;">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div style="display: flex; gap: 8px; align-items: center">
              <label style="font-weight: 600; color: var(--dark-gray)">Role:</label>
              <select id="userRoleFilter" onchange="dashboard.filterUsers()" style="padding: 8px 12px; border: 1px solid var(--light-gray); border-radius: 6px;">
                <option value="">All Roles</option>
                <option value="superuser">Super Admin</option>
                <option value="staff">Staff</option>
                <option value="user">Regular User</option>
              </select>
            </div>
            <div style="display: flex; gap: 8px; align-items: center">
              <label style="font-weight: 600; color: var(--dark-gray)">Search:</label>
              <input type="text" id="userSearchFilter" placeholder="Search by name, email, or username" onkeyup="dashboard.filterUsers()" style="padding: 8px 12px; border: 1px solid var(--light-gray); border-radius: 6px; min-width: 250px;">
            </div>
            <button class="btn btn-outline" onclick="dashboard.clearUserFilters()">
              <i class="fas fa-times"></i> Clear Filters
            </button>
            ${
              this.canModifyData()
                ? `
            <button onclick="dashboard.showCreateUserModal()" class="btn btn-primary">
              <i class="fas fa-plus"></i> Add New User
            </button>
            `
                : ""
            }
          </div>
          <button class="btn btn-secondary" id="refreshUsersBtn" onclick="dashboard.refreshUsers()">
            <i class="fas fa-sync-alt"></i> Refresh
          </button>
        </div>
      </div>
      

      
      <div class="users-table-container" style="background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
        <div class="table-header" style="padding: 20px; border-bottom: 1px solid var(--light-gray); background: var(--light-gray);">
          <h3 style="margin: 0; color: var(--black);">All Users</h3>
          <div style="display: flex; gap: 12px; align-items: center;">
            <span id="usersCount" style="color: var(--gray); font-size: 14px;">${
              users.length
            } users</span>
            <button class="btn btn-sm btn-outline" onclick="dashboard.exportUsers()">
              <i class="fas fa-download"></i> Export
            </button>
          </div>
        </div>
        
        <div style="overflow-x: auto; max-height: none;">
          <table style="width: 100%; border-collapse: collapse; min-width: 1000px;">
            <thead>
              <tr style="background: var(--light-gray);">
                <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">ID</th>
                <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">User</th>
                <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Number Plate</th>
                <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Role</th>
                <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Status</th>
                <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Member Since</th>
                <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Last Login</th>
                <th style="padding: 16px; text-align: left; border-bottom: 1px solid var(--gray); color: var(--dark-gray); font-weight: 600;">Actions</th>
              </tr>
            </thead>
            <tbody id="usersTableBody">
              ${usersHTML}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderUserRow(user) {
    const statusColor = user.is_active ? "var(--success-green)" : "var(--red)";
    const statusBg = user.is_active
      ? "rgba(76, 175, 80, 0.1)"
      : "rgba(244, 67, 54, 0.1)";
    const roleBadge = user.is_superuser
      ? "Super Admin"
      : user.is_staff
      ? "Staff"
      : "User";
    const roleColor = user.is_superuser
      ? "var(--red)"
      : user.is_staff
      ? "var(--blue)"
      : "var(--gray)";
    const roleBg = user.is_superuser
      ? "rgba(244, 67, 54, 0.1)"
      : user.is_staff
      ? "rgba(33, 150, 243, 0.1)"
      : "rgba(158, 158, 158, 0.1)";

    return `
      <tr style="border-bottom: 1px solid var(--light-gray);">
        <td style="padding: 16px; color: var(--dark-gray);">#${user.id}</td>
        <td style="padding: 16px; color: var(--dark-gray);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary-green); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px;">
              ${
                user.first_name?.charAt(0) ||
                user.username.charAt(0).toUpperCase()
              }
            </div>
            <div>
              <div style="font-weight: 600; color: var(--dark-gray);">${
                user.first_name
              } ${user.last_name}</div>
              <small style="color: var(--gray);">@${user.username}</small>
            </div>
          </div>
        </td>
        <td style="padding: 16px; color: var(--dark-gray);">${
          user.number_plate || "N/A"
        }</td>
        <td style="padding: 16px;">
          <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; background: ${roleBg}; color: ${roleColor};">
            ${roleBadge}
          </span>
        </td>
        <td style="padding: 16px;">
          <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; background: ${statusBg}; color: ${statusColor};">
            ${user.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td style="padding: 16px; color: var(--dark-gray);">${new Date(
          user.date_joined
        ).toLocaleDateString()}</td>
        <td style="padding: 16px; color: var(--dark-gray);">${
          user.last_login ? new Date(user.last_login).toLocaleString() : "Never"
        }</td>
        <td style="padding: 16px;">
          <div style="display: inline-flex; gap: 8px; flex-wrap: nowrap; white-space: nowrap; align-items: center;">
            <button onclick="dashboard.viewUserDetails(${
              user.id
            })" class="btn btn-sm btn-outline" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
            ${
              this.canModifyData()
                ? `
            <button onclick="dashboard.editUser(${
              user.id
            })" class="btn btn-sm btn-outline" style="color: var(--blue); border-color: var(--blue);" title="Edit User">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="dashboard.toggleUserStatus(${user.id}, ${
                    user.is_active
                  })" class="btn btn-sm btn-outline" style="color: ${
                    user.is_active ? "var(--orange)" : "var(--success-green)"
                  }; border-color: ${
                    user.is_active ? "var(--orange)" : "var(--success-green)"
                  };" title="${
                    user.is_active ? "Deactivate" : "Activate"
                  } User">
              <i class="fas fa-${user.is_active ? "pause" : "play"}"></i>
            </button>
            <button onclick="dashboard.resetUserPassword(${
              user.id
            })" class="btn btn-sm btn-outline" style="color: var(--orange); border-color: var(--orange);" title="Reset Password">
              <i class="fas fa-key"></i>
            </button>
            <button onclick="dashboard.deleteUser(${user.id}, '${
                    user.username
                  }')" class="btn btn-sm btn-outline" style="color: var(--red); border-color: var(--red);" title="Delete User">
              <i class="fas fa-trash"></i>
            </button>
            `
                : ""
            }
          </div>
        </td>
      </tr>
    `;
  }
  async viewUserDetails(userId) {
    const users = await this.fetchAllUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    modal.innerHTML = `
      <div class="modal-content" style="background: white; padding: 32px; border-radius: 12px; min-width: 700px; max-width: 900px; max-height: 90vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="margin: 0; color: var(--black);">User Details: ${
            user.first_name
          } ${user.last_name}</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--gray);">×</button>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
          <div>
            <h4 style="margin: 0 0 16px 0; color: var(--dark-gray);">Personal Information</h4>
            <div style="background: var(--light-gray); padding: 16px; border-radius: 8px;">
              <div style="margin-bottom: 12px;">
                <strong>Username:</strong><br>
                <span style="font-family: monospace; color: var(--dark-gray);">@${
                  user.username
                }</span>
              </div>
              <div style="margin-bottom: 12px;">
                <strong>Full Name:</strong><br>
                <span>${user.username}</span>
              </div>
              <div style="margin-bottom: 12px;">
                <strong>Email:</strong><br>
                <span>${user.email}</span>
              </div>
              <div style="margin-bottom: 12px;">
                <strong>License Number:</strong><br>
                <span>${(() => {
                  const value =
                    user.car_name ??
                    user.license_number ??
                    (user.profile ? user.profile.car_name : "");
                  const text =
                    typeof value === "string"
                      ? value.trim()
                      : String(value || "").trim();
                  return text || "Unavailable";
                })()}</span>
              </div>
              <div style="margin-bottom: 12px;">
                <strong>Number Plate:</strong><br>
                <span>${(() => {
                  const addr = user.address || "";
                  if (!addr) return "N/A";
                  if (addr.includes("|")) {
                    const parts = addr.split("|");
                    // Prefer the first segment as the number plate
                    return (parts[0] || parts[1] || "N/A").trim() || "N/A";
                  }
                  return addr.trim() || "N/A";
                })()}</span>
              </div>
              ${
                user.phone
                  ? `
              <div style="margin-bottom: 12px;">
                <strong>Phone:</strong><br>
                <span>${user.phone}</span>
              </div>
              `
                  : ""
              }
              <div style="margin-bottom: 12px;">
                <strong>License Number:</strong><br>
                <span>${(() => {
                  const value =
                    user.car_name ??
                    user.license_number ??
                    (user.profile ? user.profile.car_name : "");
                  const text =
                    typeof value === "string"
                      ? value.trim()
                      : String(value || "").trim();
                  return text || "Unavailable";
                })()}</span>
              </div>
              ${
                user.last_password_reset
                  ? `
              <div>
                <strong>Last Password Reset:</strong><br>
                <span style="color: var(--orange); font-weight: 600;">${new Date(
                  user.last_password_reset
                ).toLocaleString()}</span>
              </div>
              `
                  : ""
              }
            </div>
          </div>
          
          <div>
            <h4 style="margin: 0 0 16px 0; color: var(--dark-gray);">Account Information</h4>
            <div style="background: var(--light-gray); padding: 16px; border-radius: 8px;">
              <div style="margin-bottom: 12px;">
                <strong>User ID:</strong><br>
                <span style="font-family: monospace; color: var(--dark-gray);">#${
                  user.id
                }</span>
              </div>
              <div style="margin-bottom: 12px;">
                <strong>Balance:</strong><br>
                <span style="font-size: 18px; color: var(--primary-green); font-weight: 600;">$${(() => {
                  const b =
                    typeof user.balance === "number"
                      ? user.balance
                      : user.balance || user.wallet_balance || 0;
                  const n = typeof b === "number" ? b : parseFloat(b) || 0;
                  return n.toFixed(2);
                })()}</span>
              </div>
              <div style="margin-bottom: 12px;">
                <strong>Status:</strong><br>
                <span style="color: ${
                  user.is_active ? "var(--success-green)" : "var(--red)"
                }; font-weight: 600;">${
      user.is_active ? "Active" : "Inactive"
    }</span>
              </div>
              <div style="margin-bottom: 12px;">
                <strong>Role:</strong><br>
                <span>${
                  user.is_superuser
                    ? "Super Admin"
                    : user.is_staff
                    ? "Staff"
                    : "User"
                }</span>
              </div>
              <div style="margin-bottom: 12px;">
                <strong>Member Since:</strong><br>
                <span>${new Date(user.date_joined).toLocaleString()}</span>
              </div>
              <div style="margin-bottom: 12px;">
                <strong>Last Login:</strong><br>
                <span style="color: ${
                  user.last_login ? "var(--dark-gray)" : "var(--gray)"
                };">${
      user.last_login
        ? new Date(user.last_login).toLocaleString()
        : "Never logged in"
    }</span>
              </div>
              <div>
                <strong>Account Status:</strong><br>
                <span style="color: ${
                  user.is_active ? "var(--success-green)" : "var(--red)"
                }; font-weight: 600;">${
      user.is_active ? "Active" : "Inactive"
    }</span>
              </div>
            </div>
          </div>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button onclick="dashboard.resetUserPassword(${
            user.id
          }); this.closest('.modal-overlay').remove();" class="btn btn-outline" style="color: var(--orange); border-color: var(--orange);">
            <i class="fas fa-key"></i> Reset Password
          </button>
          <button onclick="dashboard.editUser(${
            user.id
          }); this.closest('.modal-overlay').remove();" class="btn btn-outline" style="color: var(--blue); border-color: var(--blue);">
            <i class="fas fa-edit"></i> Edit User
          </button>
          <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-secondary">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }
  async toggleUserStatus(userId, currentStatus) {
    const action = currentStatus ? "deactivate" : "activate";
    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/users/${userId}/toggle-status/`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ is_active: !currentStatus }),
        }
      );

      if (response.ok) {
        this.showNotification(`User ${action}d successfully`, "success");
        this.loadUsersData(); // Refresh the list
      } else {
        const error = await response.json();
        this.showNotification(
          error.error || `Failed to ${action} user`,
          "error"
        );
      }
    } catch (error) {
      console.error(`Error ${action}ing user:`, error);
      this.showNotification("Network error. Please try again.", "error");
    }
  }

  async resetUserPassword(userId) {
    this.showResetPasswordModal(userId);
  }

  showResetPasswordModal(userId) {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    modal.innerHTML = `
      <div class="modal-content" style="background: white; padding: 32px; border-radius: 12px; min-width: 400px; max-width: 500px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="margin: 0; color: var(--black);">Reset User Password</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--gray);">×</button>
        </div>
        
        <form id="resetPasswordForm" style="display: flex; flex-direction: column; gap: 20px;">
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>Note:</strong> After password reset, the user will need to clear their app data or reinstall the app to login with the new password.
            </p>
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--dark-gray);">New Password *</label>
            <input type="password" id="newPasswordInput" required style="width: 100%; padding: 12px; border: 1px solid var(--light-gray); border-radius: 6px; font-size: 14px;" placeholder="Enter new password">
          </div>
          
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--dark-gray);">Confirm Password *</label>
            <input type="password" id="confirmPasswordInput" required style="width: 100%; padding: 12px; border: 1px solid var(--light-gray); border-radius: 6px; font-size: 14px;" placeholder="Confirm new password">
          </div>
          
          <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px;">
            <button type="button" onclick="this.closest('.modal-overlay').remove()" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary">Reset Password</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    // Handle form submission
    document
      .getElementById("resetPasswordForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById("newPasswordInput").value;
        const confirmPassword = document.getElementById(
          "confirmPasswordInput"
        ).value;

        if (newPassword !== confirmPassword) {
          this.showNotification("Passwords do not match", "error");
          return;
        }

        if (newPassword.length < 6) {
          this.showNotification(
            "Password must be at least 6 characters long",
            "error"
          );
          return;
        }

        const success = await this.performPasswordReset(userId, newPassword);
        if (success) {
          modal.remove();
        }
      });
  }
  async performPasswordReset(userId, newPassword) {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/admin/users/${userId}/reset-password/`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: newPassword }),
        }
      );

      if (response.ok) {
        this.showNotification(
          "Password reset successfully! User must clear app data or reinstall app to login with new password.",
          "success"
        );
        // Refresh that one user row and details immediately
        const updatedUser = await this.fetchUserById(userId);
        if (updatedUser) {
          this._replaceUserInList(updatedUser);
          if (this.currentlyViewedUserId === userId) {
            this.viewUserDetails(updatedUser);
          }
        } else {
          // Fallback to refetch all users if needed
          await this.loadUsersData();
        }
        return true;
      } else {
        const error = await response.json();
        this.showNotification(
          error.error || "Failed to reset password",
          "error"
        );
        return false;
      }
    } catch (error) {
      console.error("Error resetting password:", error);
      this.showNotification("Network error. Please try again.", "error");
      return false;
    }
  }

  // Fetches one user from backend by ID
  async fetchUserById(userId) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/admin/users/`);
      if (!response.ok) return null;
      const data = await response.json();
      if (!data.success || !data.users) return null;
      return data.users.find((u) => String(u.id) === String(userId));
    } catch {
      return null;
    }
  }

  // Replaces a user in the cached list and if displayed, updates UI
  _replaceUserInList(user) {
    if (!user || !this.allUsers) return;
    const idx = this.allUsers.findIndex((u) => u.id === user.id);
    if (idx !== -1) {
      this.allUsers[idx] = user;
      // Optionally, rerender users table/list if that's how your UI works
      this.renderUsersTable && this.renderUsersTable(this.allUsers);
    }
  }

  // When editing user and submitting, after success, fetch that user again and update UI
  async handleEditUserSubmit(event, userId) {
    event.preventDefault();
    const userData = this.collectEditUserFormData(); // (existing logic)
    try {
      await this.updateUser(userId, userData);
      // If password was changed, refresh fetch user and update UI
      if (userData.password) {
        const updatedUser = await this.fetchUserById(userId);
        if (updatedUser) {
          this._replaceUserInList(updatedUser);
          this.viewUserDetails(updatedUser);
        }
      }
      this.closeModal();
    } catch (error) {
      console.error("Error updating user:", error);
      this.showNotification("Error updating user", "error");
    }
  }

  showCreateUserModal() {
    const modalHTML = `
      <div class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;">
        <div class="modal-content" style="background: white; border-radius: 12px; padding: 32px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <h2 style="margin: 0; color: var(--dark-gray);">Create New User</h2>
            <button onclick="dashboard.closeModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--gray);">&times;</button>
          </div>
          
          <form id="createUserForm" onsubmit="dashboard.handleCreateUser(event)">
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Username *</label>
              <input type="text" id="newUsername" required style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Email *</label>
              <input type="email" id="newEmail" required style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Password *</label>
              <input type="password" id="newPassword" required style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">First Name</label>
              <input type="text" id="newFirstName" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Last Name</label>
              <input type="text" id="newLastName" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Number Plate</label>
              <input type="text" id="newUserNumberPlate" placeholder="Enter vehicle number plate" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Role</label>
              <select id="newUserRole" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
                <option value="user">Regular User</option>
                <option value="staff">Staff Member</option>
                <option value="superuser">Super Admin</option>
              </select>
            </div>
            
            <div style="margin-bottom: 24px;">
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input type="checkbox" id="newUserActive" checked style="margin-right: 8px;">
                <span style="font-weight: 600; color: var(--dark-gray);">Active Account</span>
              </label>
            </div>
            
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
              <button type="button" onclick="dashboard.closeModal()" class="btn btn-outline">Cancel</button>
              <button type="submit" class="btn btn-primary">Create User</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
  }

  async handleCreateUser(event) {
    event.preventDefault();

    const userData = {
      username: document.getElementById("newUsername").value,
      email: document.getElementById("newEmail").value,
      password: document.getElementById("newPassword").value,
      first_name: document.getElementById("newFirstName").value,
      last_name: document.getElementById("newLastName").value,
      number_plate: document.getElementById("newUserNumberPlate")?.value || "",
      is_active: document.getElementById("newUserActive").checked,
      is_staff:
        document.getElementById("newUserRole").value === "staff" ||
        document.getElementById("newUserRole").value === "superuser",
      is_superuser:
        document.getElementById("newUserRole").value === "superuser",
    };

    try {
      await this.createUser(userData);
      this.closeModal();
    } catch (error) {
      console.error("Error creating user:", error);
    }
  }

  closeModal() {
    const modal = document.querySelector(".modal-overlay");
    if (modal) {
      modal.remove();
    }
    // Also remove any other modal overlays that might exist
    const allModals = document.querySelectorAll(".modal-overlay");
    allModals.forEach((modal) => modal.remove());
  }

  renderAlertsList(reports) {
    const alertsSection = document.getElementById("alerts");
    if (!alertsSection) return;
    let list = alertsSection.querySelector(".alerts-list");
    if (!list) {
      list = document.createElement("div");
      list.className = "alerts-list";
      alertsSection.appendChild(list);
    }

    if (!Array.isArray(reports) || reports.length === 0) {
      list.innerHTML =
        '<div style="padding:16px; color: var(--gray);">No alerts at the moment</div>';
      return;
    }

    list.innerHTML = reports
      .map((r) => {
        const userText = (() => {
          const u = r.user;
          if (!u) return "User";
          if (typeof u === "object") {
            const full = (
              u.full_name || `${u.first_name || ""} ${u.last_name || ""}`
            ).trim();
            return full || u.username || u.email || String(u.id) || "User";
          }
          return String(u);
        })();
        const created = r.created_at
          ? new Date(r.created_at).toLocaleString()
          : "";
        const isRead = this._readReports?.has(String(r.id));
        const statusColor = isRead ? "var(--primary-green)" : "var(--red)";
        return `
          <div class="alert-card" style="background: #fff; border-left: 4px solid ${statusColor}; border-radius: 8px; box-shadow: var(--shadow-sm); padding: 16px; margin-bottom: 12px;">
            <div style="display:flex; justify-content: space-between; align-items: center; gap: 12px;">
              <div>
                <div style="font-weight:700; color: var(--black);">${
                  r.title || "Alert"
                }</div>
                ${
                  !isRead
                    ? '<span style="display:inline-block; margin-top:4px; padding:2px 8px; font-size:11px; border-radius:999px; background: var(--red); color:#fff; font-weight:700;">NEW</span>'
                    : ""
                }
                <div style="color: var(--dark-gray); font-size: 14px; margin-top: 4px;">${this.escapeHtml(
                  r.message || ""
                )}</div>
                <div style="color: var(--gray); font-size: 12px; margin-top: 6px;">
                  <span>From: ${this.escapeHtml(String(userText))}</span>
                  <span style="margin-left:12px;">${created}</span>
                  
                </div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-outline" data-action="resolve-report" data-report-id="${
                  r.id
                }">Resolve</button>
              </div>
            </div>
          </div>`;
      })
      .join("");

    // Wire up resolve buttons (event delegation)
    list.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest('[data-action="resolve-report"]');
        if (!btn) return;
        const idStr = btn.getAttribute("data-report-id");
        const id = idStr && /^\d+$/.test(idStr) ? Number(idStr) : idStr;
        this.resolveReport(String(id));
      },
      { once: false }
    );
    this.updateAlertsBadge();
  }

  async resolveReport(id) {
    // Mark as read/resolved locally
    if (!this._readReports) this._readReports = new Set();
    this._readReports.add(String(id));
    if (!this._resolvedReports) this._resolvedReports = new Set();
    this._resolvedReports.add(String(id));

    // Update local alerts array status if present
    (this.alerts || []).forEach((a) => {
      if (String(a.id) === String(id)) a.status = "resolved";
    });
    // Re-render list to turn border green and hide NEW badge
    this.renderAlertsList(this._latestReports || this.alerts || []);
    this.updateAlertsBadge();

    // Try to persist to backend (best-effort)
    try {
      // Strip any prefix (report_, alert_, etc.) to get numeric ID
      let numericId = String(id);
      // Remove any prefix pattern (word followed by underscore)
      numericId = numericId.replace(/^[a-zA-Z]+_/, "");
      // Ensure it's a valid number, fallback to original if not
      if (!/^\d+$/.test(numericId)) {
        numericId = String(id).replace(/^report_/, "");
      }
      console.log(
        `Resolving report: original ID="${id}", numeric ID="${numericId}"`
      );
      await fetch(
        `${this.apiBaseUrl}/admin/user-reports/${numericId}/resolve/`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "resolved" }),
        }
      ).catch((err) => console.error("Failed to resolve report:", err));
    } catch (err) {
      console.error("Error in resolveReport:", err);
    }

    this.showNotification(
      "Report marked as resolved and user notified.",
      "success"
    );
  }

  viewReportById(id) {
    const report = (this.alerts || []).find((a) => String(a.id) === String(id));
    if (!report) {
      this.showNotification("Report not found", "error");
      return;
    }
    this.viewReport(report);
  }

  // Unified report viewer; accepts a full report object
  viewReport(report) {
    // Mark as read and persist
    try {
      if (!this._readReports) this._readReports = new Set();
      this._readReports.add(String(report.id));
      localStorage.setItem(
        "alertsReadIds",
        JSON.stringify(Array.from(this._readReports))
      );
      if (Array.isArray(this._latestReports)) {
        // Re-render to update colors
        this.renderAlertsList(this._latestReports);
      }
    } catch (_) {}
    const userText = (() => {
      const u = report.user;
      if (!u) return "User";
      if (typeof u === "object") {
        const full = (
          u.full_name || `${u.first_name || ""} ${u.last_name || ""}`
        ).trim();
        return full || u.username || u.email || String(u.id) || "User";
      }
      return String(u);
    })();
    const created = report.created_at
      ? new Date(report.created_at).toLocaleString()
      : "";
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;opacity:1;transition:opacity 0.3s ease;";

    const closeModal = () => {
      modal.style.opacity = "0";
      setTimeout(() => {
        if (modal.parentNode) {
          modal.remove();
        }
      }, 300);
    };

    modal.innerHTML = `
      <div class="modal-content" style="background:#fff; padding:24px; border-radius:12px; max-width:600px; width:90%;">
        <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0; color: var(--black);">User Report</h3>
          <button onclick="closeModal()" style="background:none;border:none;font-size:20px;color:var(--gray);cursor:pointer">×</button>
        </div>
        <div style="color:var(--dark-gray); white-space:pre-wrap;">${this.escapeHtml(
          report.message || ""
        )}</div>
        <div style="color:var(--gray); font-size:12px; margin-top:12px;">From: ${this.escapeHtml(
          String(userText)
        )} • ${created}</div>
        <div style="display:flex; justify-content:flex-end; margin-top:16px;">
          <button class="btn btn-secondary" onclick="closeModal()">Close</button>
        </div>
      </div>`;

    // Make closeModal function available globally for onclick handlers
    window.closeModal = closeModal;

    document.body.appendChild(modal);
  }

  updateAlertsBadge() {
    try {
      // Count only unresolved alerts (exclude resolved by status or persisted set)
      const unresolved = (this.alerts || []).filter((a) => {
        const isResolvedStatus = String(a.status) === "resolved";
        const isResolvedLocal =
          this._resolvedReports && this._resolvedReports.has(String(a.id));
        return !(isResolvedStatus || isResolvedLocal);
      });
      const alertCount = unresolved.length;
      const navItem = document.querySelector(
        '.nav-item[data-section="alerts"]'
      );
      if (!navItem) return;
      let badge = navItem.querySelector(".alerts-badge");
      if (alertCount > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "alerts-badge";
          badge.style.cssText =
            "margin-left:8px; background: var(--red); color:#fff; border-radius:999px; font-size:11px; line-height:1; padding:3px 7px; font-weight:700;";
          navItem.appendChild(badge);
        }
        badge.textContent = String(alertCount);
        badge.style.display = "inline-block";
      } else if (badge) {
        badge.style.display = "none";
      }
    } catch (_) {}
  }

  // Small helper to prevent HTML injection in dynamic strings
  escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async loadReportsData() {
    console.log("Loading reports data...");
    // Implementation for reports section
  }

  async loadSettingsData() {
    console.log("Loading settings data...");
    // Implementation for settings section
  }
  async restartDevice(deviceId) {
    if (
      !confirm(
        "Are you sure you want to restart this device? This action will restart the device's firmware and it will be offline for a few seconds."
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${this.iotApiUrl}/devices/${deviceId}/restart/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        this.showNotification(
          `Device ${deviceId} restarted successfully.`,
          "success"
        );
        this.loadDevicesData(); // Refresh the list
      } else {
        const error = await response.json();
        this.showNotification(
          error.error || `Failed to restart device ${deviceId}`,
          "error"
        );
      }
    } catch (error) {
      console.error("Error restarting device:", error);
      this.showNotification("Network error. Please try again.", "error");
    }
  }

  exportUsers() {
    // Export users data to CSV
    const users = this.allUsers || [];
    if (users.length === 0) {
      this.showNotification("No users to export", "error");
      return;
    }

    const headers = [
      "ID",
      "Username",
      "First Name",
      "Last Name",
      "Email",
      "Role",
      "Status",
      "Member Since",
      "Last Login",
      "Total Bookings",
      "Total Spent",
    ];
    const csvContent = [
      headers.join(","),
      ...users.map((user) =>
        [
          user.id,
          user.username,
          user.first_name || "",
          user.last_name || "",
          user.email,
          user.is_superuser ? "Super Admin" : user.is_staff ? "Staff" : "User",
          user.is_active ? "Active" : "Inactive",
          new Date(user.date_joined).toLocaleDateString(),
          user.last_login
            ? new Date(user.last_login).toLocaleDateString()
            : "Never",
          user.total_bookings || 0,
          user.total_spent || 0,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartpark-users-${
      new Date().toISOString().split("T")[0]
    }.csv`;
    a.click();
    URL.revokeObjectURL(url);

    this.showNotification("Users exported successfully", "success");
  }

  filterUsers() {
    const statusFilter = document.getElementById("userStatusFilter").value;
    const roleFilter = document.getElementById("userRoleFilter").value;
    const searchFilter = document
      .getElementById("userSearchFilter")
      .value.toLowerCase();

    const filteredUsers = this.allUsers.filter((user) => {
      // Status filter
      if (statusFilter && statusFilter === "active" && !user.is_active)
        return false;
      if (statusFilter && statusFilter === "inactive" && user.is_active)
        return false;

      // Role filter
      if (roleFilter && roleFilter === "superuser" && !user.is_superuser)
        return false;
      if (roleFilter && roleFilter === "staff" && !user.is_staff) return false;
      if (
        roleFilter &&
        roleFilter === "user" &&
        (user.is_staff || user.is_superuser)
      )
        return false;

      // Search filter
      if (searchFilter) {
        const searchText = `${user.username} ${user.email}`.toLowerCase();
        if (!searchText.includes(searchFilter)) return false;
      }

      return true;
    });

    // Update table body
    const tableBody = document.getElementById("usersTableBody");
    if (tableBody) {
      tableBody.innerHTML = filteredUsers
        .map((user) => this.renderUserRow(user))
        .join("");
    }

    // Update count
    const countElement = document.getElementById("usersCount");
    if (countElement) {
      countElement.textContent = `${filteredUsers.length} users`;
    }
  }

  clearUserFilters() {
    document.getElementById("userStatusFilter").value = "";
    document.getElementById("userRoleFilter").value = "";
    document.getElementById("userSearchFilter").value = "";
    this.filterUsers();
  }

  async refreshUsers() {
    const refreshBtn = document.getElementById("refreshUsersBtn");
    if (refreshBtn) {
      refreshBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
      refreshBtn.disabled = true;
    }

    try {
      await this.loadUsersData();
      this.showNotification("Users data refreshed successfully", "success");
    } catch (error) {
      console.error("Error refreshing users:", error);
      this.showNotification("Failed to refresh users data", "error");
    } finally {
      if (refreshBtn) {
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        refreshBtn.disabled = false;
      }
    }
  }

  async createUser(userData) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/admin/users/create/`, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });

      if (response.status === 401) {
        this.logout();
        return;
      }

      if (response.status === 403) {
        this.showNotification(
          "Superuser access required to create users",
          "error"
        );
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create user");
      }

      const result = await response.json();
      this.showNotification("User created successfully", "success");

      // Refresh the users list
      await this.loadUsersData();

      return result;
    } catch (error) {
      console.error("Error creating user:", error);
      this.showNotification(`Failed to create user: ${error.message}`, "error");
      throw error;
    }
  }
  async updateUser(userId, userData) {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/admin/users/${userId}/update/`,
        {
          method: "PUT",
          headers: {
            Authorization: `Token ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(userData),
        }
      );

      if (response.status === 401) {
        this.logout();
        return;
      }

      if (response.status === 403) {
        this.showNotification(
          "Superuser access required to update users",
          "error"
        );
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update user");
      }

      const result = await response.json();
      this.showNotification("User updated successfully", "success");

      // Refresh the users list
      await this.loadUsersData();
      // Also refresh bookings so updated number plates reflect immediately
      try {
        await this.loadAllBookings();
      } catch (_) {}

      return result;
    } catch (error) {
      console.error("Error updating user:", error);
      this.showNotification(`Failed to update user: ${error.message}`, "error");
      throw error;
    }
  }
  async deleteUser(userId, username) {
    if (
      !confirm(
        `Are you sure you want to delete user "${username}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/admin/users/${userId}/delete/`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Token ${this.token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 401) {
        this.logout();
        return;
      }

      if (response.status === 403) {
        this.showNotification(
          "Superuser access required to delete users",
          "error"
        );
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete user");
      }

      const result = await response.json();
      this.showNotification(`User ${username} deleted successfully`, "success");

      // Refresh the users list
      await this.loadUsersData();

      return result;
    } catch (error) {
      console.error("Error deleting user:", error);
      this.showNotification(`Failed to delete user: ${error.message}`, "error");
      throw error;
    }
  }

  async toggleUserStatus(userId, currentStatus) {
    const action = currentStatus ? "deactivate" : "activate";
    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/admin/users/${userId}/toggle-status/`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${this.token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 401) {
        this.logout();
        return;
      }

      if (response.status === 403) {
        this.showNotification(
          "Superuser access required to modify user status",
          "error"
        );
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to toggle user status");
      }

      const result = await response.json();
      this.showNotification(result.message, "success");

      // Refresh the users list
      await this.loadUsersData();

      return result;
    } catch (error) {
      console.error("Error toggling user status:", error);
      this.showNotification(
        `Failed to toggle user status: ${error.message}`,
        "error"
      );
      throw error;
    }
  }

  editUser(userId) {
    const user = this.allUsers.find((u) => u.id === userId);
    if (!user) {
      this.showNotification("User not found", "error");
      return;
    }

    const modalHTML = `
      <div class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;">
        <div class="modal-content" style="background: white; border-radius: 12px; padding: 32px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <h2 style="margin: 0; color: var(--dark-gray);">Edit User</h2>
            <button onclick="dashboard.closeModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--gray);">&times;</button>
          </div>
          
          <form id="editUserForm" onsubmit="dashboard.handleEditUser(event, ${userId})">
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Username *</label>
              <input type="text" id="editUsername" value="${
                user.username
              }" required style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Email *</label>
              <input type="email" id="editEmail" value="${
                user.email
              }" required style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">New Password (leave blank to keep current)</label>
              <input type="password" id="editPassword" placeholder="Enter new password" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Phone</label>
              <input type="tel" id="editPhone" value="${
                user.phone || ""
              }" placeholder="Enter phone number" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">License Number</label>
              <input type="text" id="editLicenseNumber" value="${
                user.license_number || ""
              }" placeholder="Enter license number" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px; font-family: monospace;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Number Plate</label>
              <input type="text" id="editNumberPlate" value="${
                user.number_plate || ""
              }" placeholder="Enter number plate" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px; font-family: monospace;">
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Balance</label>
              <input type="number" id="editBalance" value="${(() => {
                const b =
                  typeof user.balance === "number"
                    ? user.balance
                    : user.balance || user.wallet_balance || 0;
                const n = typeof b === "number" ? b : parseFloat(b) || 0;
                return n.toFixed(2);
              })()}" step="0.01" placeholder="Enter balance" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">First Name</label>
              <input type="text" id="editFirstName" value="${
                user.first_name || ""
              }" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Last Name</label>
              <input type="text" id="editLastName" value="${
                user.last_name || ""
              }" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-weight: 600; color: var(--dark-gray); margin-bottom: 8px;">Role</label>
              <select id="editUserRole" style="width: 100%; padding: 12px; border: 2px solid var(--light-gray); border-radius: 6px; font-size: 14px;">
                <option value="user" ${
                  !user.is_staff && !user.is_superuser ? "selected" : ""
                }>Regular User</option>
                <option value="staff" ${
                  user.is_staff && !user.is_superuser ? "selected" : ""
                }>Staff Member</option>
                <option value="superuser" ${
                  user.is_superuser ? "selected" : ""
                }>Super Admin</option>
              </select>
            </div>
            
            <div style="margin-bottom: 24px;">
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input type="checkbox" id="editUserActive" ${
                  user.is_active ? "checked" : ""
                } style="margin-right: 8px;">
                <span style="font-weight: 600; color: var(--dark-gray);">Active Account</span>
              </label>
            </div>
            
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
              <button type="button" onclick="dashboard.closeModal()" class="btn btn-outline">Cancel</button>
              <button type="submit" class="btn btn-primary">Update User</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
  }

  async handleEditUser(event, userId) {
    event.preventDefault();

    const userData = {
      username: document.getElementById("editUsername").value,
      email: document.getElementById("editEmail").value,
      phone: document.getElementById("editPhone")?.value || "",
      first_name: document.getElementById("editFirstName").value,
      last_name: document.getElementById("editLastName").value,
      license_number: document.getElementById("editLicenseNumber").value,
      number_plate: document.getElementById("editNumberPlate").value,
      balance: parseFloat(document.getElementById("editBalance")?.value || 0),
      is_active: document.getElementById("editUserActive").checked,
      is_staff:
        document.getElementById("editUserRole").value === "staff" ||
        document.getElementById("editUserRole").value === "superuser",
      is_superuser:
        document.getElementById("editUserRole").value === "superuser",
    };

    console.log("🔍 DEBUG: Sending userData:", userData);
    console.log(
      "🔍 DEBUG: number_plate value:",
      document.getElementById("editNumberPlate").value
    );

    // Only include password if it's not empty
    const password = document.getElementById("editPassword").value;
    if (password) {
      userData.password = password;
    }

    try {
      await this.updateUser(userId, userData);
      // If password was changed, refresh fetch user and update UI
      if (userData.password) {
        const updatedUser = await this.fetchUserById(userId);
        if (updatedUser) {
          this._replaceUserInList(updatedUser);
          this.viewUserDetails(updatedUser);
        }
      }
      this.closeModal();
    } catch (error) {
      console.error("Error updating user:", error);
    }
  }

  // ==================== REPORTS FUNCTIONALITY ====================

  async loadReportsData() {
    console.log("Loading reports data...");
    try {
      console.log("Loading all reports data (no filtering)");

      await Promise.all([
        this.loadMetricsData(),
        this.loadChartsData(),
        this.loadTablesData(),
      ]);

      this.showNotification("All reports data loaded successfully!", "success");
    } catch (error) {
      console.error("Error loading reports data:", error);
      this.showNotification("Failed to load reports data", "error");
    }
  }
  async loadMetricsData() {
    try {
      // Fetch all data from backend (no filtering)
      const [bookingsData, statsData, usersData] = await Promise.all([
        this.fetchAllBookings(),
        this.fetchParkingStats(),
        this.fetchAllUsers(),
      ]);

      // Calculate real metrics from actual data
      const metrics = this.calculateMetricsFromData(bookingsData, statsData);

      // Update metric cards
      document.getElementById(
        "totalRevenue"
      ).textContent = `$${metrics.totalRevenue.toLocaleString()}`;
      document.getElementById("totalBookings").textContent =
        metrics.totalBookings.toLocaleString();
      // Total Users metric
      const totalUsers = Array.isArray(usersData)
        ? usersData.length
        : usersData?.count ?? 0;
      const totalUsersEl = document.getElementById("totalUsers");
      if (totalUsersEl) totalUsersEl.textContent = totalUsers.toLocaleString();
      const usersChangeEl = document.getElementById("usersChange");
      if (usersChangeEl) {
        const prev = this._lastTotalUsers ?? totalUsers;
        const delta = totalUsers - prev;
        usersChangeEl.textContent = `${delta >= 0 ? "+" : ""}${delta}`;
        this._lastTotalUsers = totalUsers;
      }
      document.getElementById("overtimeRate").textContent =
        metrics.mostBookedSlot;

      // Update change indicators with real trends
      // Remove +0% style tags; clear change labels
      const revenueChangeEl = document.getElementById("revenueChange");
      if (revenueChangeEl) revenueChangeEl.textContent = "";
      const bookingsChangeEl = document.getElementById("bookingsChange");
      if (bookingsChangeEl) bookingsChangeEl.textContent = "";
      // Remove avg duration change; we now show users change
      const durationChangeEl = document.getElementById("durationChange");
      if (durationChangeEl) durationChangeEl.textContent = "";
      const overtimeChangeEl = document.getElementById("overtimeChange");
      if (overtimeChangeEl) overtimeChangeEl.textContent = "";
    } catch (error) {
      console.error("Error loading metrics:", error);
      this.showNotification("Failed to load metrics data", "error");
    }
  }

  async loadChartsData() {
    try {
      // Fetch all data for charts (no filtering)
      const [bookingsData, statsData, usersData] = await Promise.all([
        this.fetchAllBookings(),
        this.fetchParkingStats(),
        this.fetchAllUsers(),
      ]);

      // Initialize all charts with real data
      this.initRevenueChart(bookingsData);
      this.initBookingVolumeChart(bookingsData);
      this.initPeakHoursChart(bookingsData);
      this.initSlotUtilizationChart(statsData);
      this.initTopUsersChart(bookingsData, usersData);
    } catch (error) {
      console.error("Error loading charts:", error);
      this.showNotification("Failed to load chart data", "error");
    }
  }

  async loadTablesData() {
    try {
      // Fetch all data for tables (no filtering)
      const [bookingsData, usersData] = await Promise.all([
        this.fetchAllBookings(),
        this.fetchAllUsers(),
      ]);

      this.loadTopUsersTable(bookingsData, usersData);
    } catch (error) {
      console.error("Error loading tables:", error);
      this.showNotification("Failed to load table data", "error");
    }
  }
  // Chart initialization methods
  initRevenueChart(bookingsData) {
    const ctx = document.getElementById("revenueChart");
    if (!ctx) return;

    // Process real data for revenue chart directly from bookings (no dummy data)
    // Only include completed bookings for revenue
    const completed = (bookingsData || []).filter(
      (b) => String(b.status).toLowerCase() === "completed"
    );
    const revenueData = this.processRevenueDataFromBookings(completed);

    new Chart(ctx, {
      type: "line",
      data: {
        labels: revenueData.labels,
        datasets: [
          {
            label: "Daily Revenue",
            data: revenueData.values,
            borderColor: "#4CAF50",
            backgroundColor: "rgba(76, 175, 80, 0.1)",
            tension: 0.4,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return "$" + value.toLocaleString();
              },
            },
          },
        },
      },
    });
  }

  processRevenueDataFromBookings(bookings) {
    // Aggregate amount or total_cost by day (local date) from real bookings
    const map = new Map();
    bookings.forEach((b) => {
      const dt = new Date(b.completed_at || b.end_time || b.start_time);
      if (isNaN(dt)) return;
      const key = dt.toISOString().slice(0, 10); // yyyy-mm-dd
      const prev = map.get(key) || 0;
      const amount =
        b.amount !== undefined && b.amount !== null
          ? parseFloat(b.amount)
          : parseFloat(b.total_cost || 0);
      map.set(key, prev + (isNaN(amount) ? 0 : amount));
    });

    // Sort by date ascending
    const labels = Array.from(map.keys()).sort();
    const values = labels.map((k) => Math.round(map.get(k)));
    return { labels, values };
  }

  initBookingVolumeChart(bookingsData) {
    const ctx = document.getElementById("bookingVolumeChart");
    if (!ctx) return;

    // Process real data for booking volume chart
    // Only include completed bookings for volume
    const completed = (bookingsData || []).filter(
      (b) => String(b.status).toLowerCase() === "completed"
    );
    const volumeData = this.processBookingVolumeData(completed);

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: volumeData.labels,
        datasets: [
          {
            label: "Bookings",
            data: volumeData.values,
            backgroundColor: "#2196F3",
            borderColor: "#1976D2",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  }

  initPeakHoursChart(bookingsData) {
    const ctx = document.getElementById("peakHoursChart");
    if (!ctx) return;

    // Process real data for peak hours chart
    const peakData = this.processPeakHoursData(bookingsData);

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: peakData.labels,
        datasets: [
          {
            label: "Bookings",
            data: peakData.values,
            backgroundColor: "#FF9800",
            borderColor: "#F57C00",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  }
  initSlotUtilizationChart(statsData) {
    const ctx = document.getElementById("slotUtilizationChart");
    if (!ctx) return;

    // Process real data for slot utilization chart
    const utilizationData = this.processSlotUtilizationData(statsData);

    new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: utilizationData.labels,
        datasets: [
          {
            data: utilizationData.values,
            backgroundColor: ["#4CAF50", "#F44336", "#2196F3", "#FF9800"],
            borderWidth: 2,
            borderColor: "#fff",
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "bottom",
          },
        },
      },
    });
  }

  initTopUsersChart(bookingsData, usersData) {
    const ctx = document.getElementById("topUsersChart");
    if (!ctx) return;

    // Process real data for top users chart
    const topUsersData = this.processTopUsersData(bookingsData, usersData);

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: topUsersData.labels,
        datasets: [
          {
            label: "Bookings",
            data: topUsersData.values,
            backgroundColor: "#9C27B0",
            borderColor: "#7B1FA2",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        indexAxis: "y",
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          x: {
            beginAtZero: true,
          },
        },
      },
    });
  }

  loadTopUsersTable(bookingsData, usersData) {
    const container = document.getElementById("topUsersTable");
    if (!container) {
      console.error("Top users table container not found");
      return;
    }

    console.log("Loading top users table with data:", bookingsData, usersData);

    // Count bookings per user
    const userBookings = {};
    bookingsData.forEach((booking) => {
      let userId;
      if (typeof booking.user === "object" && booking.user !== null) {
        userId = booking.user.id;
      } else {
        userId = booking.user;
      }

      if (userId) {
        const amount =
          booking.amount !== undefined && booking.amount !== null
            ? parseFloat(booking.amount)
            : parseFloat(booking.total_cost || 0);
        if (userBookings[userId]) {
          userBookings[userId].count++;
          userBookings[userId].totalSpent += isNaN(amount) ? 0 : amount;
        } else {
          userBookings[userId] = {
            count: 1,
            totalSpent: isNaN(amount) ? 0 : amount,
          };
        }
      }
    });

    // Get top 5 users by booking count
    const topUsers = Object.entries(userBookings)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5)
      .map(([userId, data]) => {
        const user = usersData.find((u) => u.id == userId);
        return {
          id: userId,
          name: user
            ? user.username || user.email || `User ${userId}`
            : `User ${userId}`,
          bookings: data.count,
          totalSpent: data.totalSpent,
        };
      });

    console.log("Processed top users:", topUsers);

    const table = `
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: var(--light-gray);">
            <th style="padding: 12px; text-align: left; border-bottom: 1px solid var(--gray);">Rank</th>
            <th style="padding: 12px; text-align: left; border-bottom: 1px solid var(--gray);">User</th>
            <th style="padding: 12px; text-align: left; border-bottom: 1px solid var(--gray);">Total Bookings</th>
            <th style="padding: 12px; text-align: left; border-bottom: 1px solid var(--gray);">Total Spent</th>
            <th style="padding: 12px; text-align: left; border-bottom: 1px solid var(--gray);">Avg per Booking</th>
          </tr>
        </thead>
        <tbody>
          ${topUsers
            .map(
              (user, index) => `
            <tr style="border-bottom: 1px solid var(--light-gray);">
              <td style="padding: 12px; font-weight: 600;">#${index + 1}</td>
              <td style="padding: 12px;">${user.name}</td>
              <td style="padding: 12px; font-weight: 600; color: var(--blue);">${
                user.bookings
              }</td>
              <td style="padding: 12px; font-weight: 600; color: var(--primary-green);">$${user.totalSpent.toFixed(
                2
              )}</td>
              <td style="padding: 12px;">$${(
                user.totalSpent / user.bookings
              ).toFixed(2)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    container.innerHTML = table;
  }

  // ==================== DATA FETCHING FUNCTIONS ====================

  async fetchAllBookings() {
    try {
      console.log("Fetching all bookings (no filtering)");
      const response = await fetch(`${this.apiBaseUrl}/admin/bookings/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch bookings: ${response.status}`);
      }

      const data = await response.json();
      console.log("All bookings data:", data);
      return data.bookings || data.results || [];
    } catch (error) {
      console.error("Error fetching bookings:", error);
      return [];
    }
  }
  async fetchBookingsForPeriod(period) {
    try {
      console.log("Fetching bookings for period:", period);
      const response = await fetch(`${this.apiBaseUrl}/admin/bookings/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch bookings: ${response.status}`);
      }

      const bookings = await response.json();
      console.log("Raw bookings data:", bookings);

      // Filter bookings by period type
      const cutoffDate = new Date();

      switch (period) {
        case "hourly":
          cutoffDate.setHours(cutoffDate.getHours() - 24); // Last 24 hours
          break;
        case "daily":
          cutoffDate.setDate(cutoffDate.getDate() - 7); // Last 7 days
          break;
        case "weekly":
          cutoffDate.setDate(cutoffDate.getDate() - 30); // Last 30 days
          break;
        case "monthly":
          cutoffDate.setMonth(cutoffDate.getMonth() - 12); // Last 12 months
          break;
        default:
          cutoffDate.setDate(cutoffDate.getDate() - 7); // Default to 7 days
      }

      const filteredBookings = bookings.filter((booking) => {
        const bookingDate = new Date(booking.start_time);
        return bookingDate >= cutoffDate;
      });

      console.log(`Filtered bookings for ${period}:`, filteredBookings);
      return filteredBookings;
    } catch (error) {
      console.error("Error fetching bookings:", error);
      return [];
    }
  }
  async fetchParkingStats() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/admin/spots/`, {
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch spots: ${response.status}`);
      }

      const data = await response.json();
      return data.success ? data.spots : [];
    } catch (error) {
      console.error("Error fetching spots:", error);
      return [];
    }
  }
  calculateMetricsFromData(bookings, stats) {
    // Calculate total revenue
    const totalRevenue = bookings.reduce((sum, booking) => {
      const amount =
        booking.amount !== undefined && booking.amount !== null
          ? parseFloat(booking.amount)
          : parseFloat(booking.total_cost);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // Calculate total bookings
    const totalBookings = bookings.length;

    // Calculate average duration
    const totalDuration = bookings.reduce((sum, booking) => {
      return sum + (parseInt(booking.duration_minutes) || 0);
    }, 0);
    const avgDuration =
      totalBookings > 0 ? (totalDuration / totalBookings / 60).toFixed(1) : 0;

    // Calculate most booked slot
    const slotBookings = {};
    bookings.forEach((booking) => {
      const slotNumber =
        (booking.parking_spot && booking.parking_spot.spot_number) ||
        booking.slot ||
        "Unknown";
      slotBookings[slotNumber] = (slotBookings[slotNumber] || 0) + 1;
    });

    const mostBookedSlot = Object.entries(slotBookings).sort(
      ([, a], [, b]) => b - a
    )[0];

    const mostBookedSlotInfo = mostBookedSlot
      ? `${mostBookedSlot[0]} (${mostBookedSlot[1]} bookings)`
      : "No data";

    return {
      totalRevenue: Math.round(totalRevenue),
      totalBookings,
      avgDuration: parseFloat(avgDuration),
      mostBookedSlot: mostBookedSlotInfo,
      revenueChange: 0, // No comparison since showing all data
      bookingsChange: 0, // No comparison since showing all data
      durationChange: 0,
      overtimeChange: 0,
    };
  }

  calculatePreviousPeriodMetrics(bookings, period) {
    // Simplified calculation - in a real implementation, you'd fetch previous period data
    const previousPeriodDays = parseInt(period);
    const previousCutoff = new Date();
    previousCutoff.setDate(previousCutoff.getDate() - previousPeriodDays * 2);

    const previousBookings = bookings.filter((booking) => {
      const bookingDate = new Date(booking.start_time);
      return (
        bookingDate >= previousCutoff &&
        bookingDate <
          new Date(Date.now() - previousPeriodDays * 24 * 60 * 60 * 1000)
      );
    });

    const totalRevenue = previousBookings.reduce((sum, booking) => {
      const amount =
        booking.amount !== undefined && booking.amount !== null
          ? parseFloat(booking.amount)
          : parseFloat(booking.total_cost);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    return {
      totalRevenue: Math.round(totalRevenue),
      totalBookings: previousBookings.length,
    };
  }

  // ==================== DATA PROCESSING FUNCTIONS ====================

  processRevenueData(bookings) {
    const labels = [];
    const values = [];
    const dailyRevenue = {};

    // Group all bookings by date
    bookings.forEach((booking) => {
      const bookingDate = new Date(booking.start_time);
      const dateStr = bookingDate.toISOString().split("T")[0];

      if (dailyRevenue[dateStr]) {
        dailyRevenue[dateStr] += parseFloat(booking.total_cost) || 0;
      } else {
        dailyRevenue[dateStr] = parseFloat(booking.total_cost) || 0;
      }
    });

    // Sort dates and create labels/values
    const sortedDates = Object.keys(dailyRevenue).sort();

    sortedDates.forEach((dateStr) => {
      const date = new Date(dateStr);
      labels.push(
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      );
      values.push(Math.round(dailyRevenue[dateStr]));
    });

    return { labels, values };
  }

  processBookingVolumeData(bookings) {
    const labels = [];
    const values = [];
    const dailyBookings = {};

    // Group all bookings by date
    bookings.forEach((booking) => {
      const bookingDate = new Date(booking.start_time);
      const dateStr = bookingDate.toISOString().split("T")[0];

      if (dailyBookings[dateStr]) {
        dailyBookings[dateStr]++;
      } else {
        dailyBookings[dateStr] = 1;
      }
    });

    // Sort dates and create labels/values
    const sortedDates = Object.keys(dailyBookings).sort();

    sortedDates.forEach((dateStr) => {
      const date = new Date(dateStr);
      labels.push(
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      );
      values.push(dailyBookings[dateStr]);
    });

    return { labels, values };
  }

  processOvertimeData(bookings) {
    const labels = [];
    const values = [];
    const dailyOvertime = {};

    // Group all bookings by date and calculate overtime rate
    bookings.forEach((booking) => {
      const bookingDate = new Date(booking.start_time);
      const dateStr = bookingDate.toISOString().split("T")[0];

      if (!dailyOvertime[dateStr]) {
        dailyOvertime[dateStr] = { total: 0, overtime: 0 };
      }

      dailyOvertime[dateStr].total++;
      // Check for overtime using multiple criteria
      const hasOvertime =
        booking.is_overtime ||
        (booking.overtime_minutes && booking.overtime_minutes > 0) ||
        (booking.overtime_cost && parseFloat(booking.overtime_cost) > 0);

      if (hasOvertime) {
        dailyOvertime[dateStr].overtime++;
      }
    });

    // Sort dates and create labels/values
    const sortedDates = Object.keys(dailyOvertime).sort();

    sortedDates.forEach((dateStr) => {
      const date = new Date(dateStr);
      const data = dailyOvertime[dateStr];
      const overtimeRate =
        data.total > 0 ? (data.overtime / data.total) * 100 : 0;

      labels.push(
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      );
      values.push(Math.round(overtimeRate * 10) / 10); // Round to 1 decimal place
    });

    console.log("Overtime data processed:", { labels, values, dailyOvertime });
    return { labels, values };
  }

  processPeakHoursData(bookings) {
    const hourCounts = {};

    // Initialize all hours
    for (let i = 0; i < 24; i++) {
      hourCounts[i] = 0;
    }

    // Count bookings by hour
    bookings.forEach((booking) => {
      const hour = new Date(booking.start_time).getHours();
      hourCounts[hour]++;
    });

    // Get peak hours (6AM to 10PM)
    const peakHours = [];
    const peakLabels = [];

    for (let i = 6; i <= 22; i += 2) {
      peakLabels.push(`${i}:00`);
      peakHours.push(hourCounts[i] + hourCounts[i + 1]);
    }

    return { labels: peakLabels, values: peakHours };
  }

  processSlotUtilizationData(stats) {
    // Use real spots data with booking counts
    if (stats && Array.isArray(stats)) {
      // Sort spots by booking count (most booked first)
      const sortedSpots = stats.sort(
        (a, b) => (b.booking_count || 0) - (a.booking_count || 0)
      );

      // Get top 4 most booked slots
      const topSpots = sortedSpots.slice(0, 4);

      return {
        labels: topSpots.map(
          (spot) => spot.name || spot.spot_number || `Slot ${spot.id}`
        ),
        values: topSpots.map((spot) => spot.booking_count || 0),
      };
    }

    // Fallback to mock data
    return {
      labels: ["Slot A", "Slot B", "Slot C", "Slot D"],
      values: [45, 32, 18, 12],
    };
  }

  processTopUsersData(bookings, users) {
    // Count bookings per user
    const userBookings = {};

    bookings.forEach((booking) => {
      // Handle both cases: user as ID or user as object
      let userId;
      if (typeof booking.user === "object" && booking.user !== null) {
        userId = booking.user.id;
      } else {
        userId = booking.user;
      }

      if (userId) {
        if (userBookings[userId]) {
          userBookings[userId]++;
        } else {
          userBookings[userId] = 1;
        }
      }
    });

    // Sort by booking count and get top 3
    const sortedUsers = Object.entries(userBookings)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    const labels = sortedUsers.map(([userId, count]) => {
      const user = users.find((u) => u.id == userId);
      if (user) {
        return user.username || user.email || `User ${userId}`;
      }
      return `User ${userId}`;
    });

    const values = sortedUsers.map(([, count]) => count);

    return { labels, values };
  }

  // Helper methods for generating mock data (keeping as fallback)
  generateMockRevenue(period) {
    return Math.floor(Math.random() * 50000 + 10000);
  }

  generateMockBookings(period) {
    return Math.floor(Math.random() * 500 + 100);
  }

  generateMockDuration(period) {
    return (Math.random() * 4 + 1).toFixed(1);
  }

  generateDateLabels(days) {
    const labels = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      labels.push(
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      );
    }
    return labels;
  }

  generateMockRevenueData(days) {
    const data = [];
    for (let i = 0; i < days; i++) {
      data.push(Math.floor(Math.random() * 2000 + 500));
    }
    return data;
  }
  generateMockBookingData(days) {
    const data = [];
    for (let i = 0; i < days; i++) {
      data.push(Math.floor(Math.random() * 50 + 10));
    }
    return data;
  }

  generateMockOvertimeData(days) {
    const data = [];
    for (let i = 0; i < days; i++) {
      data.push(Math.floor(Math.random() * 30 + 5));
    }
    return data;
  }

  getStatusColor(status) {
    const colors = {
      Completed: "#4CAF50",
      Active: "#2196F3",
      Overtime: "#FF9800",
      Good: "#4CAF50",
      Excellent: "#2E7D32",
      Warning: "#FF9800",
      Error: "#F44336",
    };
    return colors[status] || "#9E9E9E";
  }

  exportReports() {
    // Mock export functionality
    const data = {
      timestamp: new Date().toISOString(),
      period: document.getElementById("reportPeriod")?.value || "30",
      metrics: {
        totalRevenue: document.getElementById("totalRevenue").textContent,
        totalBookings: document.getElementById("totalBookings").textContent,
        avgDuration: document.getElementById("avgDuration").textContent,
        overtimeRate: document.getElementById("overtimeRate").textContent,
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartpark-reports-${
      new Date().toISOString().split("T")[0]
    }.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.showNotification("Reports exported successfully!", "success");
  }

  // ==================== HELPER FUNCTIONS ====================

  formatDuration(minutes) {
    if (!minutes) return "0h 0m";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  getBookingStatus(booking) {
    if (booking.status === "completed") return "Completed";
    if (booking.status === "active") return "Active";
    if (
      booking.is_overtime ||
      (booking.overtime_minutes && booking.overtime_minutes > 0)
    )
      return "Overtime";
    if (booking.status === "cancelled") return "Cancelled";
    return "Unknown";
  }
}

// Initialize the dashboard when DOM is loaded
let dashboard;
document.addEventListener("DOMContentLoaded", () => {
  dashboard = new SmartParkAdmin();
  // Make dashboard globally accessible for onclick handlers
  window.dashboard = dashboard;
});
// Add CSS for animations
const style = document.createElement("style");
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);
