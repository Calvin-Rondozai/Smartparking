// SmartPark Admin Login (JavaScript)

(() => {
  const form = document.getElementById("loginForm");
  const usernameEl = document.getElementById("username");
  const passwordEl = document.getElementById("password");
  const errorEl = document.getElementById("errorMessage");
  const successEl = document.getElementById("successMessage");

  // Always target Django backend for API calls (default http://localhost:8000).
  // Optionally override via localStorage: backendOrigin
  let BACKEND_ORIGIN =
    (typeof window !== "undefined" &&
      window.localStorage &&
      window.localStorage.getItem("backendOrigin")) ||
    "http://localhost:8000";
  // If served from port 5500 and no override set, assume backend on 8000
  if (
    typeof window !== "undefined" &&
    window.location &&
    window.location.port === "5500" &&
    (!window.localStorage || !window.localStorage.getItem("backendOrigin"))
  ) {
    BACKEND_ORIGIN = "http://localhost:8000";
  }
  const PRIMARY_LOGIN = `${BACKEND_ORIGIN}/api/chatbot/admin-login/`;
  const ALT_LOGIN_1 = `${BACKEND_ORIGIN}/api/admin-login/`;
  const ALT_LOGIN_2 = `${BACKEND_ORIGIN}/api/chatbot/login-admin/`;

  function showError(msg) {
    if (successEl) successEl.style.display = "none";
    if (errorEl) {
      errorEl.textContent = msg || "Login failed";
      errorEl.style.display = "block";
    } else {
      alert(msg || "Login failed");
    }
  }

  function showSuccess(msg) {
    if (errorEl) errorEl.style.display = "none";
    if (successEl) {
      successEl.textContent = msg || "Login successful";
      successEl.style.display = "block";
    }
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = (usernameEl?.value || "").trim();
      const password = passwordEl?.value || ""; // preserve spaces

      if (!username || !password) {
        showError("Please enter username and password");
        return;
      }

      try {
        // Try primary admin-login endpoint first
        let resp = await fetch(PRIMARY_LOGIN, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });

        // If 404, try aliases
        if (resp.status === 404) {
          resp = await fetch(ALT_LOGIN_1, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          if (resp.status === 404) {
            resp = await fetch(ALT_LOGIN_2, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username, password }),
            });
          }
        }

        const raw = await resp.text();
        let data = {};
        try {
          data = JSON.parse(raw);
        } catch (_) {}
        if (!resp.ok || !data.success) {
          console.error("Admin login failed", {
            url: PRIMARY_LOGIN,
            status: resp.status,
            body: raw,
          });
          showError(
            data?.error || data?.message || `Login failed (${resp.status})`
          );
          return;
        }

        const token = data?.token;
        if (!token) {
          showError("No token returned by server");
          return;
        }

        // Persist token for dashboard script.js to use
        window.localStorage.setItem("adminToken", token);
        window.localStorage.setItem("adminUser", JSON.stringify(data.user));

        showSuccess("Logged in. Redirecting...");
        setTimeout(() => {
          window.location.href = "index.html";
        }, 400);
      } catch (err) {
        showError("Network error. Please try again.");
      }
    });
  }
})();
