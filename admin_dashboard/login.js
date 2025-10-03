// Login functionality for SmartPark Admin
class AdminLogin {
  constructor() {
    this.apiBaseUrl = "http://10.38.47.47:8000/api";
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.checkAuthStatus();
  }

  setupEventListeners() {
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }
  }

  async checkAuthStatus() {
    const token = localStorage.getItem("adminToken");
    if (token) {
      try {
        const response = await fetch(`${this.apiBaseUrl}/auth/verify/`, {
          method: "GET",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          // User is already authenticated, redirect to dashboard
          window.location.href = "index.html";
        } else {
          // Token is invalid, remove it
          localStorage.removeItem("adminToken");
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        localStorage.removeItem("adminToken");
      }
    }
  }

  async handleLogin() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const remember = document.getElementById("remember").checked;

    if (!username || !password) {
      this.showError("Please enter both username and password");
      return;
    }

    try {
      this.showLoading();

      const response = await fetch(`${this.apiBaseUrl}/auth/signin/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username,
          password: password,
          is_admin_login: true, // Flag to indicate this is admin login
        }),
      });

      const data = await response.json();

      if (response.ok && data.token) {
        // Store token
        localStorage.setItem("adminToken", data.token);
        localStorage.setItem("adminUser", JSON.stringify(data.user));

        if (remember) {
          localStorage.setItem("rememberMe", "true");
        }

        this.showSuccess("Login successful! Redirecting...");

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          window.location.href = "index.html";
        }, 1000);
      } else {
        this.showError(
          data.error || "Login failed. Please check your credentials."
        );
      }
    } catch (error) {
      console.error("Login error:", error);
      this.showError("Network error. Please try again.");
    } finally {
      this.hideLoading();
    }
  }

  showLoading() {
    const submitBtn = document.querySelector(
      '#loginForm button[type="submit"]'
    );
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Signing In...';
    }
  }

  hideLoading() {
    const submitBtn = document.querySelector(
      '#loginForm button[type="submit"]'
    );
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    }
  }

  showError(message) {
    const errorDiv = document.getElementById("errorMessage");
    const successDiv = document.getElementById("successMessage");

    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = "block";
    }

    if (successDiv) {
      successDiv.style.display = "none";
    }
  }

  showSuccess(message) {
    const successDiv = document.getElementById("successMessage");
    const errorDiv = document.getElementById("errorMessage");

    if (successDiv) {
      successDiv.textContent = message;
      successDiv.style.display = "block";
    }

    if (errorDiv) {
      errorDiv.style.display = "none";
    }
  }
}

// Password toggle functionality
function togglePassword() {
  const passwordInput = document.getElementById("password");
  const toggleBtn = document.querySelector(".toggle-password i");

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    toggleBtn.className = "fas fa-eye-slash";
  } else {
    passwordInput.type = "password";
    toggleBtn.className = "fas fa-eye";
  }
}

// Initialize login when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new AdminLogin();
});
