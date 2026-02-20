/* ==========================================================
   DS // AUTO-DOC ENGINE — main.js  (complete rewrite)
   Wrapped in an IIFE to prevent ALL variable conflicts with
   CDN globals (window.supabase, window.ethers, etc.)
   window.* assignments at the bottom expose functions to HTML.
   ========================================================== */

(function () {

  // ── CONFIG ────────────────────────────────────────────────
  var CFG = {
    sbUrl:        "https://kutmygkodxtfbtdtwqef.supabase.co",
    sbKey:        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE", // ← your anon key
    groqKey:      "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",
    groqModel:    "qwen/qwen3-32b",
    receiver:     "0xfF82D591F726eF56313EF958Bb7d7D85866C4E8B",
    costPerDoc:   0.50,
    topupCredits: 10,
    topupUsdt:    "5",
    networks: {
      polygon: {
        chainId: 137, chainName: "Polygon Mainnet",
        nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
        rpcUrls: ["https://polygon-rpc.com"],
        blockExplorerUrls: ["https://polygonscan.com"],
        usdtAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        usdtDecimals: 6,
      },
      bsc: {
        chainId: 56, chainName: "BNB Smart Chain",
        nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
        rpcUrls: ["https://bsc-dataseed.binance.org/"],
        blockExplorerUrls: ["https://bscscan.com"],
        usdtAddress: "0x55d398326f99059fF775485246999027B3197955",
        usdtDecimals: 18,
      },
    },
  };

  var ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address account) view returns (uint256)",
  ];

  // ── STATE ─────────────────────────────────────────────────
  var db           = null;   // Supabase client (NOT named 'supabase' — avoids CDN clash)
  var currentUser  = null;
  var selectedFile = null;
  var ethProvider  = null;
  var ethSigner    = null;

  // ── BOOT ──────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    db = window.supabase.createClient(CFG.sbUrl, CFG.sbKey);

    db.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (session && session.user) {
        currentUser = session.user;
        ensureProfile().then(function () { showScreen("dashboard"); });
      } else {
        showScreen("landing");
      }
    });

    db.auth.onAuthStateChange(function (_ev, session) {
      currentUser = session && session.user ? session.user : null;
    });

    var fi  = document.getElementById("file-input");
    var ub  = document.getElementById("file-upload-btn");
    var cfb = document.getElementById("clear-file-btn");
    var sb  = document.getElementById("send-btn");

    if (ub)  ub.addEventListener("click",  function () { fi && fi.click(); });
    if (sb)  sb.addEventListener("click",  generateReadme);
    if (cfb) cfb.addEventListener("click", clearFile);

    if (fi) {
      fi.addEventListener("change", function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        selectedFile = f;
        var n = document.getElementById("file-name");
        if (n) n.textContent = f.name;
        var p = document.getElementById("file-preview");
        if (p) p.classList.add("visible");
        showToast("File loaded: " + f.name, "info");
      });
    }
  });

  function clearFile() {
    selectedFile = null;
    var fi = document.getElementById("file-input");
    if (fi) fi.value = "";
    var p = document.getElementById("file-preview");
    if (p) p.classList.remove("visible");
  }

  // ── SCREENS ───────────────────────────────────────────────
  function showScreen(name) {
    ["landing", "auth", "dashboard"].forEach(function (s) {
      var el = document.getElementById(s + "-screen");
      if (!el) return;
      if (s === name) { el.classList.remove("screen-hidden"); }
      else            { el.classList.add("screen-hidden"); }
    });
    if (name === "dashboard") updateBalanceDisplay();
  }

  function showAuth(mode) {
    showScreen("auth");
    toggleAuthMode(mode || "signin");
  }

  function toggleAuthMode(mode) {
    var si = document.getElementById("signin-form");
    var su = document.getElementById("signup-form");
    if (si) si.style.display = mode === "signin" ? "block" : "none";
    if (su) su.style.display = mode === "signup" ? "block" : "none";
  }

  // ── AUTH ──────────────────────────────────────────────────
  function handleSignUp() {
    var em = val("signup-email");
    var pw = val("signup-password");
    if (!em || !pw)   return showToast("Email and password required.", "error");
    if (pw.length < 6) return showToast("Password needs 6+ characters.", "error");

    setLoading(true, "Creating your account...");
    db.auth.signUp({ email: em.trim(), password: pw })
      .then(function (r) {
        if (r.error) throw r.error;
        if (r.data && r.data.user) {
          currentUser = r.data.user;
          return ensureProfile().then(function () {
            showToast("Welcome! 10 free credits added.", "success");
            showScreen("dashboard");
          });
        }
        showToast("Check your email to confirm your account.", "info");
      })
      .catch(function (e) { showToast(e.message || "Sign-up failed.", "error"); })
      .finally(function () { setLoading(false); });
  }

  function handleSignIn() {
    var em = val("signin-email");
    var pw = val("signin-password");
    if (!em || !pw) return showToast("Email and password required.", "error");

    setLoading(true, "Logging in...");
    db.auth.signInWithPassword({ email: em.trim(), password: pw })
      .then(function (r) {
        if (r.error) throw r.error;
        currentUser = r.data.user;
        return ensureProfile().then(function () {
          showToast("Welcome back!", "success");
          showScreen("dashboard");
        });
      })
      .catch(function (e) { showToast(e.message || "Login failed.", "error"); })
      .finally(function () { setLoading(false); });
  }

  function handleSignOut() {
    db.auth.signOut().then(function () {
      currentUser = selectedFile = ethProvider = ethSigner = null;
      var wb = document.getElementById("wallet-badge");
      if (wb) wb.style.display = "none";
      resetChatUI();
      showScreen("landing");
      showToast("Signed out.", "info");
    });
  }

  function ensureProfile() {
    if (!currentUser) return Promise.resolve();
    return db.from("profiles").select("id").eq("id", currentUser.id).maybeSingle()
      .then(function (r) {
        if (r.error || !r.data) {
          return db.from("profiles").insert([{
            id: currentUser.id, email: currentUser.email, credits: 10
          }]);
        }
      });
  }

  // ── BALANCE ───────────────────────────────────────────────
  function updateBalanceDisplay() {
    if (!currentUser) return;
    db.from("profiles").select("credits").eq("id", currentUser.id).single()
      .then(function (r) {
        if (r.data) {
          var el = document.getElementById("balance");
          if (el) el.textContent = Number(r.data.credits).toFixed(2);
        }
      });
  }

  function getCredits() {
    return db.from("profiles").select("credits").eq("id", currentUser.id).single()
      .then(function (r) {
        if (r.error) throw new Error("Could not fetch credits.");
        return Number(r.data.credits);
      });
  }

  function deductCredits(amount) {
    return getCredits().then(function (cur) {
      var upd = parseFloat((cur - amount).toFixed(2));
      return db.from("profiles").update({ credits: upd }).eq("id", currentUser.id)
        .then(function (r) {
          if (r.error) throw new Error("Failed to save credits.");
          return upd;
        });
    });
  }

  // ── GROQ GENERATION ───────────────────────────────────────
  function generateReadme() {
    if (!currentUser)  return showToast("Please log in first.", "error");
    if (!selectedFile) return showToast("Upload a code file first.", "error");
    var sendBtn = document.getElementById("send-btn");

    getCredits()
      .then(function (credits) {
        if (credits < CFG.costPerDoc)
          throw new Error("Insufficient credits ($" + CFG.costPerDoc + " needed). Top up with USDT.");
        return selectedFile.text();
      })
      .then(function (code) {
        setLoading(true, "Analyzing code with Qwen-32B...");
        if (sendBtn) sendBtn.disabled = true;

        var instr   = val("message-input") || "";
        var snippet = code.substring(0, 12000);
        var sys = [
          "You are a world-class Senior Technical Writer and Software Architect.",
          "Generate an exceptional professional README.md for the provided code.",
          "- Use professional emojis at the start of each major section heading.",
          "- Include: Overview, ✨ Features, 🚀 Quick Start, 📦 Installation, 🏗 Architecture,",
          "  🛠 Tech Stack (Markdown table: Technology | Version | Purpose),",
          "  📡 API Reference (if applicable), 🤝 Contributing, 📄 License.",
          "- Explain the architecture deeply, as a Senior Engineer would.",
          "- Output ONLY raw Markdown — no preamble, no wrapper code fences."
        ].join("\n");
        var usr = (instr ? "Special Instructions: " + instr + "\n\n" : "")
          + "Filename: " + selectedFile.name + "\n\nCode:\n```\n" + snippet + "\n```";

        return fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + CFG.groqKey },
          body: JSON.stringify({ model: CFG.groqModel, temperature: 0.6, max_tokens: 4096,
            messages: [{ role: "system", content: sys }, { role: "user", content: usr }] }),
        });
      })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (e) {
          throw new Error((e && e.error && e.error.message) || ("Groq error " + res.status));
        });
        return res.json();
      })
      .then(function (data) {
        // safe traversal — avoids "cannot read properties of undefined"
        var text = data && data.choices && data.choices[0]
          && data.choices[0].message && data.choices[0].message.content;
        if (!text) throw new Error("AI returned an empty response. Please try again.");

        return deductCredits(CFG.costPerDoc).then(function (newCredits) {
          var el = document.getElementById("balance");
          if (el) el.textContent = newCredits.toFixed(2);
          // fire-and-forget log
          db.from("transactions").insert([{
            user_id: currentUser.id, type: "debit",
            amount: CFG.costPerDoc, description: "README for: " + selectedFile.name
          }]);
          renderResult(text, selectedFile.name);
          showToast("README generated! $" + CFG.costPerDoc + " deducted.", "success");
        });
      })
      .catch(function (e) {
        console.error("Generation error:", e);
        renderError(e.message);
        showToast("Error: " + e.message, "error");
      })
      .finally(function () {
        setLoading(false);
        if (sendBtn) sendBtn.disabled = false;
      });
  }

  // ── MARKDOWN RENDERER ─────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function renderMarkdown(raw) {
    if (!raw) return "";
    var md = raw.replace(/^(Certainly[!,.]?|Here is[^:]*:|Sure[!,.]?|I['']ve generated)[^\n]*\n+/gi,"").trim();

    // fenced code blocks
    md = md.replace(/```[\w]*\n?([\s\S]*?)```/g, function(_, c){ return "<pre>" + esc(c.trim()) + "</pre>"; });

    // tables
    md = md.replace(/^\|(.+)\|\s*\n\|[\s\-|:]+\|\s*\n((?:\|.+\|\n?)+)/gm, function(_,h,r){
      var ths = h.split("|").filter(function(x){return x.trim();}).map(function(x){return "<th>"+x.trim()+"</th>";}).join("");
      var trs = r.trim().split("\n").map(function(row){
        var tds = row.split("|").filter(function(x){return x.trim();}).map(function(x){return "<td>"+x.trim()+"</td>";}).join("");
        return "<tr>"+tds+"</tr>";
      }).join("");
      return "<table><thead><tr>"+ths+"</tr></thead><tbody>"+trs+"</tbody></table>";
    });

    md = md.replace(/^### (.+)$/gm,"<h3>$1</h3>");
    md = md.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    md = md.replace(/^# (.+)$/gm,  "<h1>$1</h1>");
    md = md.replace(/\*\*\*(.+?)\*\*\*/g,"<strong><em>$1</em></strong>");
    md = md.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
    md = md.replace(/\*(.+?)\*/g,"<em>$1</em>");
    md = md.replace(/`([^`]+)`/g,"<code>$1</code>");
    md = md.replace(/^> (.+)$/gm,"<blockquote>$1</blockquote>");
    md = md.replace(/^[\-\*\+] (.+)$/gm,"<li>$1</li>");
    md = md.replace(/^\d+\. (.+)$/gm,"<li>$1</li>");
    md = md.replace(/(<li>[\s\S]+?<\/li>)(\n(?!<li>)|$)/g,"<ul>$1</ul>$2");
    md = md.replace(/^-{3,}$/gm,"<hr>");
    md = md.replace(/^(?!<[a-zA-Z\/])(.+)$/gm,"<p>$1</p>");
    md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    return md;
  }

  // ── RENDER RESULT / ERROR ─────────────────────────────────
  function renderResult(readmeText, filename) {
    var chat = document.getElementById("chat-messages");
    if (!chat) return;
    chat.innerHTML =
      '<div class="result-card">' +
        '<div class="result-header">' +
          '<span class="result-tag">✅ POWERED BY QWEN-32B</span>' +
          '<span style="font-family:var(--mono);font-size:.7rem;color:var(--muted)">' + esc(filename) + '</span>' +
        '</div>' +
        '<div class="result-body">' + renderMarkdown(readmeText) + '</div>' +
        '<div style="padding:0 28px 28px">' +
          '<button class="btn-download" id="dl-btn">⬇ Download README.md</button>' +
        '</div>' +
      '</div>';

    var dlBtn = document.getElementById("dl-btn");
    if (dlBtn) dlBtn.addEventListener("click", function () {
      var blob = new Blob([readmeText], { type: "text/markdown;charset=utf-8" });
      var a    = document.createElement("a");
      a.href   = URL.createObjectURL(blob);
      a.download = "README.md";
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
    });
    chat.scrollTop = 0;
  }

  function renderError(msg) {
    var chat = document.getElementById("chat-messages");
    if (!chat) return;
    chat.innerHTML = '<div class="error-card"><strong>⚠ GENERATION FAILED</strong><p>' + esc(msg) + '</p></div>';
  }

  function resetChatUI() {
    var chat = document.getElementById("chat-messages");
    if (!chat) return;
    chat.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon"><i class="fas fa-file-code"></i></div>' +
        '<p class="empty-title">Upload your source code and hit Generate<br>' +
        'Cost: <span class="empty-cost">$0.50</span> per professional README</p>' +
      '</div>';
  }

  // ── WEB3 PAYMENT (Ethers v6) ──────────────────────────────
  function payWithUSDT() {
    if (!currentUser) return showToast("Please log in first.", "error");
    if (typeof window.ethers === "undefined") return showToast("ethers.js not loaded.", "error");
    if (!window.ethereum) return showToast("MetaMask not detected.", "error");

    var topupBtn  = document.getElementById("topup-btn");
    var walletAddr = null;

    if (topupBtn) topupBtn.disabled = true;
    setLoading(true, "Connecting wallet...");

    window.ethereum.request({ method: "eth_requestAccounts" })
      .then(function () {
        ethProvider = new ethers.BrowserProvider(window.ethereum);
        return ethProvider.getSigner();
      })
      .then(function (s) {
        ethSigner = s;
        return ethSigner.getAddress();
      })
      .then(function (addr) {
        walletAddr = addr;
        var badge = document.getElementById("wallet-badge");
        if (badge) { badge.textContent = addr.slice(0,6)+"..."+addr.slice(-4); badge.style.display="block"; }

        var netKey = (document.getElementById("crypto-network")||{}).value || "bsc";
        var net    = CFG.networks[netKey];
        if (!net) throw new Error("Unknown network.");

        setLoading(true, "Switching network...");
        return switchOrAddChain(net).then(function () { return { net: net, netKey: netKey }; });
      })
      .then(function (ctx) {
        // re-init after chain switch — critical for ethers v6
        ethProvider = new ethers.BrowserProvider(window.ethereum);
        return ethProvider.getSigner().then(function (s) { ethSigner = s; return ctx; });
      })
      .then(function (ctx) {
        setLoading(true, "Checking USDT balance...");
        var contract = new ethers.Contract(ctx.net.usdtAddress, ERC20_ABI, ethSigner);
        var sendAmt  = ethers.parseUnits(CFG.topupUsdt, ctx.net.usdtDecimals);
        return contract.balanceOf(walletAddr).then(function (bal) {
          if (bal < sendAmt) {
            var h = parseFloat(ethers.formatUnits(bal, ctx.net.usdtDecimals)).toFixed(2);
            throw new Error("Insufficient USDT. Have " + h + ", need " + CFG.topupUsdt + ".");
          }
          setLoading(true, "Waiting for MetaMask approval...");
          showToast("Confirm the transaction in MetaMask.", "info");
          return contract.transfer(CFG.receiver, sendAmt).then(function (tx) {
            showToast("Tx sent: " + tx.hash.slice(0,14) + "...", "info");
            setLoading(true, "Waiting for on-chain confirmation...");
            return tx.wait(1).then(function (receipt) { return { receipt: receipt, netKey: ctx.netKey }; });
          });
        });
      })
      .then(function (ctx) {
        if (ctx.receipt.status !== 1) throw new Error("Transaction reverted on-chain.");
        return getCredits().then(function (cur) {
          var nxt = parseFloat((cur + CFG.topupCredits).toFixed(2));
          return db.from("profiles").update({ credits: nxt }).eq("id", currentUser.id)
            .then(function (r) {
              if (r.error) throw new Error("Credit update failed. TX: " + ctx.receipt.hash);
              db.from("transactions").insert([{
                user_id: currentUser.id, type: "topup",
                amount: CFG.topupCredits,
                description: "USDT top-up via " + ctx.netKey,
                tx_hash: ctx.receipt.hash,
              }]);
              var el = document.getElementById("balance");
              if (el) el.textContent = nxt.toFixed(2);
              var badge = document.getElementById("wallet-badge");
              if (badge) badge.textContent = walletAddr.slice(0,6)+"..."+walletAddr.slice(-4)+" ✓";
              showToast("Payment confirmed! +" + CFG.topupCredits + " credits.", "success");
            });
        });
      })
      .catch(function (e) {
        console.error("Payment error:", e);
        if (e.code === 4001 || (e.message && e.message.toLowerCase().includes("user rejected")))
          showToast("Transaction cancelled.", "info");
        else
          showToast("Payment error: " + (e.message || "Unknown"), "error");
      })
      .finally(function () {
        setLoading(false);
        if (topupBtn) topupBtn.disabled = false;
      });
  }

  function switchOrAddChain(net) {
    var hex = "0x" + net.chainId.toString(16);
    return window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] })
      .catch(function (e) {
        if (e.code === 4902) {
          return window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
            chainId: hex, chainName: net.chainName, nativeCurrency: net.nativeCurrency,
            rpcUrls: net.rpcUrls, blockExplorerUrls: net.blockExplorerUrls,
          }] });
        }
        throw e;
      });
  }

  // ── UI HELPERS ────────────────────────────────────────────
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : "";
  }

  function setLoading(on, msg) {
    var o = document.getElementById("loading-overlay");
    var t = document.getElementById("loading-text");
    if (!o) return;
    on ? o.classList.add("visible") : o.classList.remove("visible");
    if (t && msg) t.textContent = msg;
  }

  function showToast(msg, type, ms) {
    var c = document.getElementById("toast-container");
    if (!c) return;
    var t = document.createElement("div");
    t.className   = "toast " + (type || "info");
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function () {
      t.style.cssText += "transition:opacity .4s,transform .4s;opacity:0;transform:translateX(20px)";
      setTimeout(function () { t.parentNode && t.parentNode.removeChild(t); }, 400);
    }, ms || 4000);
  }

  // ── EXPOSE TO WINDOW (required for HTML onclick= attributes) ──
  window.showScreen     = showScreen;
  window.showAuth       = showAuth;
  window.toggleAuthMode = toggleAuthMode;
  window.handleSignUp   = handleSignUp;
  window.handleSignIn   = handleSignIn;
  window.handleSignOut  = handleSignOut;
  window.payWithUSDT    = payWithUSDT;
  window.generateReadme = generateReadme;

}()); // end IIFE — nothing leaks to global scope
