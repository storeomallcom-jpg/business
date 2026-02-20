/* =====================================================================
   DS // AUTO-DOC ENGINE — main.js
   Modular, error-handled logic for Auth, Web3 Payments, and Groq API
   ===================================================================== */

"use strict";

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
  supabaseUrl:    "https://xtgttdwovdgsqvdwmvwi.supabase.co",
  // ⚠️  PASTE YOUR ACTUAL SUPABASE ANON KEY BELOW:
  supabaseAnonKey:"PASTE_YOUR_SUPABASE_ANON_KEY_HERE",
  groqApiKey:     "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",
  groqModel:      "qwen-2.5-32b",  // Groq model id
  receiverWallet: "0xfF82D591F726eF56313EF958Bb7d7D85866C4E8B",
  creditCostPerDoc: 0.50,
  topupCreditAmount: 10,
  topupUsdtAmount: "5",
  networks: {
    polygon: {
      chainId: 137,
      chainName: "Polygon Mainnet",
      nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
      rpcUrls: ["https://polygon-rpc.com"],
      blockExplorerUrls: ["https://polygonscan.com"],
      usdtAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      usdtDecimals: 6,
    },
    bsc: {
      chainId: 56,
      chainName: "BNB Smart Chain",
      nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
      rpcUrls: ["https://bsc-dataseed.binance.org/"],
      blockExplorerUrls: ["https://bscscan.com"],
      usdtAddress: "0x55d398326f99059fF775485246999027B3197955",
      usdtDecimals: 18,
    },
  },
};

// ERC-20 minimal ABI
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
];

// ============================================================
// STATE
// ============================================================
let supabaseClient = null;   // ← avoids conflict with window.supabase CDN global
let currentUser = null;
let selectedFile = null;
let ethersProvider = null;
let ethersSigner = null;

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // Init Supabase
  supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

  // Restore session
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      currentUser = session.user;
      ensureProfile().then(() => showScreen("dashboard"));
    } else {
      showScreen("landing");
    }
  });

  // Listen for auth changes
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
  });

  // Wire up file upload
  const fileInput    = document.getElementById("file-input");
  const uploadBtn    = document.getElementById("file-upload-btn");
  const clearFileBtn = document.getElementById("clear-file-btn");
  const sendBtn      = document.getElementById("send-btn");

  uploadBtn?.addEventListener("click", () => fileInput?.click());
  sendBtn?.addEventListener("click", generateReadme);

  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    selectedFile = file;
    document.getElementById("file-name").textContent = file.name;
    document.getElementById("file-preview").classList.add("visible");
    showToast(`File loaded: ${file.name}`, "info");
  });

  clearFileBtn?.addEventListener("click", () => {
    selectedFile = null;
    if (fileInput) fileInput.value = "";
    document.getElementById("file-preview").classList.remove("visible");
  });

  // Expose global handlers for HTML onclick attributes
  window.handleSignIn    = handleSignIn;
  window.handleSignUp    = handleSignUp;
  window.handleSignOut   = handleSignOut;
  window.payWithUSDT     = payWithUSDT;
  window.showScreen      = showScreen;
  window.showAuth        = showAuth;
  window.toggleAuthMode  = toggleAuthMode;
  window.generateReadme  = generateReadme;
});

// ============================================================
// SCREEN MANAGEMENT
// ============================================================
function showScreen(name) {
  ["landing", "auth", "dashboard"].forEach((s) => {
    const el = document.getElementById(`${s}-screen`);
    if (!el) return;
    el.classList.toggle("screen-hidden", s !== name);
  });
  if (name === "dashboard") updateBalanceDisplay();
}

function showAuth(mode = "signin") {
  showScreen("auth");
  toggleAuthMode(mode);
}

function toggleAuthMode(mode) {
  document.getElementById("signin-form").style.display = mode === "signin" ? "block" : "none";
  document.getElementById("signup-form").style.display = mode === "signup" ? "block" : "none";
}

// ============================================================
// AUTH
// ============================================================
async function handleSignUp() {
  const email    = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;

  if (!email || !password) return showToast("Email and password required.", "error");
  if (password.length < 6)  return showToast("Password must be at least 6 characters.", "error");

  setLoading(true, "Creating your account...");
  try {
    const { data, error } = await supabaseClientClient.auth.signUp({ email, password });
    if (error) throw error;

    if (data.user) {
      currentUser = data.user;
      // Trigger may handle profile creation; ensure it exists
      await ensureProfile();
      showToast("Account created! Welcome — enjoy your 10 free credits.", "success");
      showScreen("dashboard");
    } else {
      showToast("Check your email to confirm your account.", "info");
    }
  } catch (err) {
    showToast(err.message || "Sign-up failed.", "error");
  } finally {
    setLoading(false);
  }
}

async function handleSignIn() {
  const email    = document.getElementById("signin-email").value.trim();
  const password = document.getElementById("signin-password").value;

  if (!email || !password) return showToast("Email and password required.", "error");

  setLoading(true, "Logging in...");
  try {
    const { data, error } = await supabaseClientClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    currentUser = data.user;
    await ensureProfile();
    showToast("Welcome back!", "success");
    showScreen("dashboard");
  } catch (err) {
    showToast(err.message || "Login failed.", "error");
  } finally {
    setLoading(false);
  }
}

async function handleSignOut() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  selectedFile = null;
  ethersProvider = null;
  ethersSigner = null;
  document.getElementById("wallet-badge").style.display = "none";
  resetChatUI();
  showScreen("landing");
  showToast("Signed out.", "info");
}

// Ensure a profiles row exists (handles edge cases where trigger didn't fire)
async function ensureProfile() {
  if (!currentUser) return;
  const { data, error } = await supabaseClientClient
    .from("profiles")
    .select("id")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error || !data) {
    // Insert with welcome credits
    await supabaseClient.from("profiles").insert([{
      id:      currentUser.id,
      email:   currentUser.email,
      credits: 10,
    }]).select().maybeSingle();
  }
}

// ============================================================
// BALANCE
// ============================================================
async function updateBalanceDisplay() {
  if (!currentUser) return;
  try {
    const { data } = await supabaseClientClient
      .from("profiles")
      .select("credits")
      .eq("id", currentUser.id)
      .single();

    if (data) {
      document.getElementById("balance").textContent = Number(data.credits).toFixed(2);
    }
  } catch (_) { /* silent */ }
}

async function getCredits() {
  const { data, error } = await supabaseClientClient
    .from("profiles")
    .select("credits")
    .eq("id", currentUser.id)
    .single();
  if (error) throw new Error("Could not fetch credits.");
  return Number(data.credits);
}

async function deductCredits(amount) {
  const current = await getCredits();
  const updated  = parseFloat((current - amount).toFixed(2));
  const { error } = await supabaseClientClient
    .from("profiles")
    .update({ credits: updated })
    .eq("id", currentUser.id);
  if (error) throw new Error("Failed to update credits.");
  return updated;
}

// ============================================================
// GROQ AI GENERATION
// ============================================================
async function generateReadme() {
  if (!currentUser)   return showToast("Please log in first.", "error");
  if (!selectedFile)  return showToast("Upload a code file first.", "error");

  // Pre-flight credit check
  let credits;
  try {
    credits = await getCredits();
  } catch (err) {
    return showToast(err.message, "error");
  }

  if (credits < CONFIG.creditCostPerDoc) {
    return showToast(`Insufficient credits. You need $${CONFIG.creditCostPerDoc}. Top up with USDT.`, "error");
  }

  setLoading(true, "Analyzing your code with Qwen-32B...");
  const sendBtn = document.getElementById("send-btn");
  if (sendBtn) sendBtn.disabled = true;

  try {
    const fileContent  = await selectedFile.text();
    const instructions = document.getElementById("message-input").value.trim();
    const truncated    = fileContent.substring(0, 12000); // ~3k tokens safety margin

    const systemPrompt = `You are a world-class Senior Technical Writer and Software Architect.
Your task is to generate an exceptional, professional README.md for the provided code.

Requirements:
- Use professional emojis at the start of each major section heading
- Include these sections: Overview, ✨ Features, 🚀 Quick Start, 📦 Installation, 🏗 Architecture, 🛠 Tech Stack (as a Markdown table), 📡 API Reference (if applicable), 🤝 Contributing, 📄 License
- The Tech Stack table must have columns: Technology | Version | Purpose
- Explain the code architecture deeply, as a Senior Engineer would
- Make the writing clear, structured, and engaging
- Output ONLY raw Markdown — no preamble, no explanation, no code fences around the full output`;

    const userPrompt = `${instructions ? `Special Instructions: ${instructions}\n\n` : ""}Filename: ${selectedFile.name}\n\nCode:\n\`\`\`\n${truncated}\n\`\`\``;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${CONFIG.groqApiKey}`,
      },
      body: JSON.stringify({
        model:       CONFIG.groqModel,
        temperature: 0.6,
        max_tokens:  4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `Groq API Error ${response.status}`);
    }

    const result     = await response.json();
    const readmeText = result.choices?.[0]?.message?.content;
    if (!readmeText) throw new Error("AI returned empty response.");

    // Deduct credits AFTER successful generation
    const newCredits = await deductCredits(CONFIG.creditCostPerDoc);
    document.getElementById("balance").textContent = newCredits.toFixed(2);

    // Log transaction
    supabaseClient.from("transactions").insert([{
      user_id:     currentUser.id,
      type:        "debit",
      amount:      CONFIG.creditCostPerDoc,
      description: `README generated for: ${selectedFile.name}`,
    }]).then(() => {});

    renderResult(readmeText, selectedFile.name);
    showToast(`README generated! $${CONFIG.creditCostPerDoc} deducted.`, "success");

  } catch (err) {
    console.error("Generation error:", err);
    renderError(err.message);
    showToast("Generation failed: " + err.message, "error");
  } finally {
    setLoading(false);
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ============================================================
// MARKDOWN RENDERER
// ============================================================
function renderMarkdown(text) {
  if (!text) return "";

  // Strip any AI preamble like "Certainly! Here is..."
  let md = text.replace(/^(Certainly[!,.]?|Here is[^:]*:|Sure[!,.]?|I've generated)[^\n]*\n+/gi, "").trim();

  // Tables: | col | col |
  md = md.replace(/^\|(.+)\|\s*\n\|[\s\-|]+\|\s*\n((?:\|.+\|\s*\n)+)/gm, (_match, header, rows) => {
    const ths = header.split("|").filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join("");
    const trs = rows.trim().split("\n").map(row => {
      const tds = row.split("|").filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  });

  // Code blocks
  md = md.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
    `<pre>${escapeHtml(code.trim())}</pre>`
  );

  // Headings
  md = md.replace(/^# (.*$)/gm,  '<h1>$1</h1>');
  md = md.replace(/^## (.*$)/gm, '<h2>$2</h2>'.replace('$2','$1'));
  md = md.replace(/^### (.*$)/gm,'<h3>$1</h3>');

  // Inline formatting
  md = md.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  md = md.replace(/\*\*(.*?)\*\*/g,     '<strong>$1</strong>');
  md = md.replace(/\*(.*?)\*/g,         '<em>$1</em>');
  md = md.replace(/`([^`]+)`/g,         '<code>$1</code>');

  // Blockquotes
  md = md.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  md = md.replace(/^[\-\*\+] (.+)$/gm, '<li>$1</li>');
  md = md.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  md = md.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Horizontal rules
  md = md.replace(/^---+$/gm, '<hr>');

  // Paragraphs: wrap bare lines
  md = md.replace(/^(?!<[a-z]|#)(.+)$/gm, '<p>$1</p>');

  // Links
  md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  return md;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================================
// RENDER RESULT / ERROR
// ============================================================
function renderResult(readmeText, filename) {
  const chat = document.getElementById("chat-messages");
  if (!chat) return;

  const html = renderMarkdown(readmeText);
  chat.innerHTML = `
    <div class="result-card">
      <div class="result-header">
        <span class="result-tag">✅ POWERED BY QWEN-32B</span>
        <span style="font-family:var(--mono);font-size:0.7rem;color:var(--muted)">${escapeHtml(filename)}</span>
      </div>
      <div class="result-body">${html}</div>
      <div style="padding:0 28px 28px">
        <button class="btn-download" id="dl-btn">⬇ Download README.md</button>
      </div>
    </div>`;

  document.getElementById("dl-btn")?.addEventListener("click", () => {
    const blob = new Blob([readmeText], { type: "text/markdown;charset=utf-8" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = "README.md";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  chat.scrollTop = 0;
}

function renderError(message) {
  const chat = document.getElementById("chat-messages");
  if (!chat) return;
  chat.innerHTML = `
    <div class="error-card">
      <strong>⚠ GENERATION FAILED</strong>
      <p>${escapeHtml(message)}</p>
    </div>`;
}

function resetChatUI() {
  const chat = document.getElementById("chat-messages");
  if (!chat) return;
  chat.innerHTML = `
    <div class="empty-state" id="empty-state">
      <div class="empty-icon"><i class="fas fa-file-code"></i></div>
      <p class="empty-title">Upload your source code and hit Generate<br>Cost: <span class="empty-cost">$0.50</span> per professional README</p>
    </div>`;
}

// ============================================================
// WEB3 PAYMENT
// ============================================================
async function payWithUSDT() {
  if (!currentUser) return showToast("Please log in first.", "error");
  if (typeof window.ethers === "undefined") return showToast("ethers.js not loaded.", "error");
  if (!window.ethereum) return showToast("MetaMask not detected. Please install it.", "error");

  const topupBtn = document.getElementById("topup-btn");
  if (topupBtn) topupBtn.disabled = true;

  try {
    // 1. Request accounts
    setLoading(true, "Connecting wallet...");
    await window.ethereum.request({ method: "eth_requestAccounts" });

    ethersProvider = new ethers.BrowserProvider(window.ethereum);
    ethersSigner   = await ethersProvider.getSigner();
    const address  = await ethersSigner.getAddress();

    // Update wallet badge
    const badge = document.getElementById("wallet-badge");
    badge.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
    badge.style.display = "block";

    // 2. Get selected network config
    const networkKey = document.getElementById("crypto-network").value;
    const net        = CONFIG.networks[networkKey];
    if (!net) throw new Error("Unknown network selected.");

    // 3. Switch/add chain
    setLoading(true, "Switching network...");
    await switchOrAddChain(net);

    // 4. Re-init provider after chain switch (important in ethers v6)
    ethersProvider = new ethers.BrowserProvider(window.ethereum);
    ethersSigner   = await ethersProvider.getSigner();

    // 5. Check USDT balance
    setLoading(true, "Checking USDT balance...");
    const usdtContract = new ethers.Contract(net.usdtAddress, ERC20_ABI, ethersSigner);
    const walletAddress = await ethersSigner.getAddress();
    const rawBalance   = await usdtContract.balanceOf(walletAddress);
    const sendAmount   = ethers.parseUnits(CONFIG.topupUsdtAmount, net.usdtDecimals);

    if (rawBalance < sendAmount) {
      const humanBalance = ethers.formatUnits(rawBalance, net.usdtDecimals);
      throw new Error(`Insufficient USDT. You have ${parseFloat(humanBalance).toFixed(2)} USDT, need ${CONFIG.topupUsdtAmount}.`);
    }

    // 6. Send USDT transfer
    setLoading(true, "Waiting for transaction approval...");
    showToast("Please confirm the transaction in MetaMask.", "info");

    const tx = await usdtContract.transfer(CONFIG.receiverWallet, sendAmount);
    setLoading(true, "Transaction sent. Waiting for confirmation...");
    showToast(`Transaction sent: ${tx.hash.slice(0, 12)}...`, "info");

    // 7. Wait for on-chain confirmation
    const receipt = await tx.wait(1); // wait 1 confirmation

    if (receipt.status !== 1) throw new Error("Transaction reverted on-chain.");

    // 8. Update Supabase credits
    const currentCredits = await getCredits();
    const newCredits     = parseFloat((currentCredits + CONFIG.topupCreditAmount).toFixed(2));

    const { error: updateError } = await supabaseClientClient
      .from("profiles")
      .update({ credits: newCredits })
      .eq("id", currentUser.id);

    if (updateError) throw new Error("Payment confirmed but credit update failed. Contact support with tx: " + receipt.hash);

    // Log transaction
    await supabaseClient.from("transactions").insert([{
      user_id:     currentUser.id,
      type:        "topup",
      amount:      CONFIG.topupCreditAmount,
      description: `USDT top-up via ${networkKey}`,
      tx_hash:     receipt.hash,
    }]);

    document.getElementById("balance").textContent = newCredits.toFixed(2);
    badge.textContent = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} ✓`;
    showToast(`Payment confirmed! +${CONFIG.topupCreditAmount} credits added.`, "success");

  } catch (err) {
    console.error("Payment error:", err);
    // User rejection — don't show scary message
    if (err.code === 4001 || err.message?.includes("user rejected")) {
      showToast("Transaction cancelled.", "info");
    } else {
      showToast("Payment error: " + (err.message || "Unknown error"), "error");
    }
  } finally {
    setLoading(false);
    if (topupBtn) topupBtn.disabled = false;
  }
}

async function switchOrAddChain(net) {
  const chainHex = `0x${net.chainId.toString(16)}`;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }],
    });
  } catch (switchErr) {
    // 4902 = chain not added yet
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId:           chainHex,
          chainName:         net.chainName,
          nativeCurrency:    net.nativeCurrency,
          rpcUrls:           net.rpcUrls,
          blockExplorerUrls: net.blockExplorerUrls,
        }],
      });
    } else {
      throw switchErr;
    }
  }
}

// ============================================================
// UI HELPERS
// ============================================================
function setLoading(visible, message = "Processing...") {
  const overlay = document.getElementById("loading-overlay");
  const text    = document.getElementById("loading-text");
  if (!overlay) return;
  overlay.classList.toggle("visible", visible);
  if (text) text.textContent = message;
}

function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.4s, transform 0.4s";
    toast.style.opacity    = "0";
    toast.style.transform  = "translateX(20px)";
    setTimeout(() => toast.remove(), 400);
  }, duration);
}
