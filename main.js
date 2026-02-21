/* ================================================================
   DS AUTO-DOC ENGINE · main.js
   ================================================================ */
(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────
  var CFG = {
    sbUrl:        'https://cfltxffuoodpzxigfpgo.supabase.co',
    sbKey:        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmbHR4ZmZ1b29kcHp4aWdmcGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzI5NzMsImV4cCI6MjA4NzIwODk3M30.jtqQq5YhxtoC-yG_xycbP76o1TcFc0mhe3AvPhgYGZA',
    groqKey:      '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',
    groqModel:    'qwen/qwen3-32b',
    receiver:     '0xfF82D591F726eF56313EF958Bb7d7D85866C4E8B',
    costPerDoc:   0.50,
    topupCredits: 10.00,
    topupUsdt:    '5',
    adminEmail:   'ahmadzaoujal2009@gmail.com',
    affiliateKey: 'ds_affiliate_ref',
    networks: {
      polygon: {
        chainId: 137, chainName: 'Polygon Mainnet',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://polygon-rpc.com'],
        blockExplorerUrls: ['https://polygonscan.com'],
        usdtAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        usdtDecimals: 6,
      },
      bsc: {
        chainId: 56, chainName: 'BNB Smart Chain',
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        rpcUrls: ['https://bsc-dataseed.binance.org/'],
        blockExplorerUrls: ['https://bscscan.com'],
        usdtAddress: '0x55d398326f99059fF775485246999027B3197955',
        usdtDecimals: 18,
      },
    },
  };

  var ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address account) view returns (uint256)',
  ];

  // ── STATE ──────────────────────────────────────────────────
  var db          = null;
  var currentUser = null;
  var selectedFile = null;
  var ethProvider = null;
  var ethSigner   = null;

  // ================================================================
  // BOOT
  // ================================================================
  document.addEventListener('DOMContentLoaded', function () {
    db = window.supabase.createClient(CFG.sbUrl, CFG.sbKey);

    // BUG FIX #2: Capture ?ref= from URL and persist it
    captureAffiliateCode();

    // Restore session
    db.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (session && session.user) {
        currentUser = session.user;
        showScreen('dashboard');
      } else {
        showScreen('landing');
      }
    });

    db.auth.onAuthStateChange(function (_ev, session) {
      currentUser = session && session.user ? session.user : null;
    });

    // File input wiring
    var fi  = document.getElementById('file-input');
    var ub  = document.getElementById('file-upload-btn');
    var cfb = document.getElementById('clear-file-btn');
    var sb  = document.getElementById('send-btn');

    if (ub)  ub.addEventListener('click', function () { fi && fi.click(); });
    if (sb)  sb.addEventListener('click', generateReadme);
    if (cfb) cfb.addEventListener('click', clearFile);
    if (fi)  fi.addEventListener('change', onFileSelected);
  });

  // ================================================================
  // BUG FIX #2: AFFILIATE CODE CAPTURE
  // Reads ?ref=CODE from the URL → stores in localStorage
  // Cleans the URL so it doesn't persist on refresh
  // ================================================================
  function captureAffiliateCode() {
    try {
      var params  = new URLSearchParams(window.location.search);
      var refCode = params.get('ref');
      if (refCode && refCode.trim() !== '') {
        localStorage.setItem(CFG.affiliateKey, refCode.trim());
        // Clean URL without triggering a reload
        var cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (e) {
      // localStorage may be blocked in some contexts; non-fatal
      console.warn('Affiliate capture skipped:', e.message);
    }
  }

  function getStoredAffiliateCode() {
    try { return localStorage.getItem(CFG.affiliateKey) || null; }
    catch (e) { return null; }
  }

  function clearStoredAffiliateCode() {
    try { localStorage.removeItem(CFG.affiliateKey); } catch (e) { /* noop */ }
  }

  // ================================================================
  // SCREENS
  // ================================================================
  function showScreen(name) {
    ['landing', 'auth', 'dashboard'].forEach(function (s) {
      var el = document.getElementById(s + '-screen');
      if (!el) return;
      el.classList.toggle('hidden', s !== name);
    });
    if (name === 'dashboard') {
      refreshBalance();
      loadAffiliateLink();
    }
  }

  function showAuth(mode) {
    showScreen('auth');
    toggleAuthMode(mode || 'signin');

    // Show referral notice if a code is stored
    var notice = document.getElementById('ref-notice');
    if (notice) {
      notice.style.display = getStoredAffiliateCode() ? 'flex' : 'none';
    }
  }

  function toggleAuthMode(mode) {
    var si = document.getElementById('signin-form');
    var su = document.getElementById('signup-form');
    if (si) si.style.display = (mode === 'signin') ? 'block' : 'none';
    if (su) su.style.display = (mode === 'signup') ? 'block' : 'none';
  }

  // ================================================================
  // AUTH
  // ================================================================
  function handleSignUp() {
    var email = val('signup-email').trim();
    var pw    = val('signup-password');

    if (!email || !pw)    return toast('Email and password required.', 'error');
    if (pw.length < 6)    return toast('Password must be at least 6 characters.', 'error');

    // BUG FIX #2: Pass the stored affiliate code to Supabase
    // It will land in auth.users.raw_user_meta_data and be picked up by the trigger
    var refCode = getStoredAffiliateCode();
    var metadata = refCode ? { affiliate_ref: refCode } : {};

    setLoading(true, 'Creating account…');

    db.auth.signUp({
      email:    email,
      password: pw,
      options:  { data: metadata },
    })
      .then(function (r) {
        if (r.error) throw r.error;

        if (r.data && r.data.user) {
          currentUser = r.data.user;
          clearStoredAffiliateCode();
          toast('Account created! $5.00 free credit added.', 'success');
          showScreen('dashboard');
        } else {
          // Email confirmation required
          toast('Check your email to confirm your account.', 'info');
        }
      })
      .catch(function (e) { toast(e.message || 'Sign-up failed.', 'error'); })
      .finally(function () { setLoading(false); });
  }

  function handleSignIn() {
    var email = val('signin-email').trim();
    var pw    = val('signin-password');

    if (!email || !pw) return toast('Email and password required.', 'error');

    setLoading(true, 'Signing in…');

    db.auth.signInWithPassword({ email: email, password: pw })
      .then(function (r) {
        if (r.error) throw r.error;
        currentUser = r.data.user;
        toast('Welcome back!', 'success');
        showScreen('dashboard');
      })
      .catch(function (e) { toast(e.message || 'Login failed.', 'error'); })
      .finally(function () { setLoading(false); });
  }

  function handleSignOut() {
    db.auth.signOut().then(function () {
      currentUser = selectedFile = ethProvider = ethSigner = null;
      hide('wallet-badge');
      resetChatUI();
      showScreen('landing');
      toast('Signed out.', 'info');
    });
  }

  // ================================================================
  // AFFILIATE LINK (dashboard)
  // ================================================================
  function loadAffiliateLink() {
    if (!currentUser) return;
    db.from('profiles')
      .select('affiliate_code')
      .eq('id', currentUser.id)
      .single()
      .then(function (r) {
        if (r.data && r.data.affiliate_code) {
          var base = window.location.origin + window.location.pathname;
          var link = base + '?ref=' + r.data.affiliate_code;
          var el   = document.getElementById('affiliate-link');
          if (el) el.value = link;
        }
      });
  }

  function copyAffiliateLink() {
    var el = document.getElementById('affiliate-link');
    if (!el || !el.value) return;
    navigator.clipboard.writeText(el.value)
      .then(function () { toast('Affiliate link copied! Earn $5 per referral.', 'success'); })
      .catch(function () {
        el.select();
        document.execCommand('copy');
        toast('Link copied!', 'success');
      });
  }

  // ================================================================
  // BALANCE
  // ================================================================
  function refreshBalance() {
    if (!currentUser) return;
    db.from('profiles')
      .select('credits')
      .eq('id', currentUser.id)
      .single()
      .then(function (r) {
        if (r.data) setBalanceDisplay(r.data.credits);
      });
  }

  function setBalanceDisplay(v) {
    var el = document.getElementById('balance');
    if (el) el.textContent = '$' + Number(v).toFixed(2);
  }

  // ================================================================
  // CREDIT OPS — all via SECURITY DEFINER RPC to bypass RLS safely
  // ================================================================
  function deductCredits(amount) {
    return db.rpc('deduct_credits', { p_amount: amount }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return r.data;
    });
  }

  function addCredits(amount) {
    return db.rpc('add_credits', { p_amount: amount }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return r.data;
    });
  }

  // ================================================================
  // README GENERATION
  // ================================================================
  function generateReadme() {
    if (!currentUser)  return toast('Please log in first.', 'error');
    if (!selectedFile) return toast('Upload a code file first.', 'error');

    var sendBtn = document.getElementById('send-btn');

    db.from('profiles')
      .select('credits')
      .eq('id', currentUser.id)
      .single()
      .then(function (r) {
        if (!r.data || Number(r.data.credits) < CFG.costPerDoc) {
          throw new Error('Insufficient balance. Top up to continue ($0.50 per README).');
        }
        return selectedFile.text();
      })
      .then(function (code) {
        setLoading(true, 'Analyzing with Qwen-32B…');
        if (sendBtn) sendBtn.disabled = true;

        var instructions = val('message-input');
        var snippet      = code.substring(0, 12000);

        var systemPrompt = [
          'You are a world-class Senior Technical Writer and Software Architect.',
          'Generate a professional, senior-engineer-level README.md for the provided code.',
          'Requirements:',
          '- Use emojis at the start of each major section heading.',
          '- Include: Overview, ✨ Features, 🚀 Quick Start, 📦 Installation,',
          '  🏗 Architecture (deep, explain data flows and module relationships),',
          '  🛠 Tech Stack (Markdown table: Technology | Version | Purpose),',
          '  📡 API Reference (if applicable), 🤝 Contributing, 📄 License.',
          '- Write like a Principal Engineer reviewing this codebase.',
          '- Output ONLY raw Markdown. No preamble. No wrapper code fences.',
        ].join('\n');

        var userPrompt = (instructions ? 'Special instructions: ' + instructions + '\n\n' : '')
          + 'Filename: ' + selectedFile.name + '\n\nCode:\n```\n' + snippet + '\n```';

        return fetch('https://api.groq.com/openai/v1/chat/completions', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': 'Bearer ' + CFG.groqKey,
          },
          body: JSON.stringify({
            model:       CFG.groqModel,
            temperature: 0.5,
            max_tokens:  4096,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: userPrompt   },
            ],
          }),
        });
      })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (e) {
            throw new Error((e && e.error && e.error.message) || 'Groq API error ' + res.status);
          });
        }
        return res.json();
      })
      .then(function (data) {
        var text = data &&
          data.choices && data.choices[0] &&
          data.choices[0].message && data.choices[0].message.content;
        if (!text) throw new Error('AI returned an empty response.');

        return deductCredits(CFG.costPerDoc).then(function (newBal) {
          setBalanceDisplay(newBal);

          // Log the transaction
          db.from('transactions').insert([{
            user_id:     currentUser.id,
            type:        'debit',
            amount:      CFG.costPerDoc,
            description: 'README · ' + selectedFile.name,
          }]);

          renderResult(text, selectedFile.name);
          toast('README generated! $0.50 deducted.', 'success');
        });
      })
      .catch(function (e) {
        console.error('Generation error:', e);
        renderError(e.message);
        toast(e.message, 'error');
      })
      .finally(function () {
        setLoading(false);
        if (sendBtn) sendBtn.disabled = false;
      });
  }

  // ================================================================
  // FILE HANDLING
  // ================================================================
  function onFileSelected(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    selectedFile = f;
    var nameEl = document.getElementById('file-name');
    if (nameEl) nameEl.textContent = f.name;
    var preview = document.getElementById('file-preview');
    if (preview) preview.classList.add('visible');
    toast('File ready: ' + f.name, 'info');
  }

  function clearFile() {
    selectedFile = null;
    var fi = document.getElementById('file-input');
    if (fi) fi.value = '';
    var preview = document.getElementById('file-preview');
    if (preview) preview.classList.remove('visible');
  }

  // ================================================================
  // MARKDOWN RENDERER
  // ================================================================
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderMarkdown(raw) {
    if (!raw) return '';
    var md = raw
      .replace(/^(Certainly[!,.]?|Here is[^:]*:|Sure[!,.]?)[^\n]*\n+/gi, '')
      .trim();

    // Fenced code blocks
    md = md.replace(/```[\w-]*\n?([\s\S]*?)```/g, function (_, c) {
      return '<pre><code>' + esc(c.trim()) + '</code></pre>';
    });

    // Tables
    md = md.replace(/^\|(.+)\|\s*\n\|[\s\-|:]+\|\s*\n((?:\|.+\|\n?)+)/gm, function (_, h, r) {
      var ths = h.split('|').filter(function (x) { return x.trim(); })
        .map(function (x) { return '<th>' + x.trim() + '</th>'; }).join('');
      var trs = r.trim().split('\n').map(function (row) {
        var tds = row.split('|').filter(function (x) { return x.trim(); })
          .map(function (x) { return '<td>' + x.trim() + '</td>'; }).join('');
        return '<tr>' + tds + '</tr>';
      }).join('');
      return '<div class="table-wrap"><table><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table></div>';
    });

    // Headings
    md = md.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    md = md.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
    md = md.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

    // Inline formatting
    md = md.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    md = md.replace(/\*(.+?)\*/g, '<em>$1</em>');
    md = md.replace(/`([^`]+)`/g, '<code>$1</code>');
    md = md.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Lists
    md = md.replace(/^[\-\*\+] (.+)$/gm, '<li>$1</li>');
    md = md.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    md = md.replace(/(<li>[\s\S]+?<\/li>)(\n(?!<li>)|$)/g, '<ul>$1</ul>$2');

    // Links
    md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Horizontal rule
    md = md.replace(/^-{3,}$/gm, '<hr>');

    // Paragraphs
    md = md.replace(/^(?!<[a-zA-Z\/])(.+)$/gm, '<p>$1</p>');

    return md;
  }

  // ================================================================
  // RENDER RESULT / ERROR
  // ================================================================
  function renderResult(text, filename) {
    var chat = document.getElementById('chat-messages');
    if (!chat) return;

    chat.innerHTML =
      '<div class="result-card">' +
        '<div class="result-header">' +
          '<span class="result-badge">✅ Qwen-32B</span>' +
          '<span class="result-file">' + esc(filename) + '</span>' +
        '</div>' +
        '<div class="result-body">' + renderMarkdown(text) + '</div>' +
        '<div class="result-footer">' +
          '<button class="btn-download" id="dl-btn">↓ Download README.md</button>' +
        '</div>' +
      '</div>';

    var dlBtn = document.getElementById('dl-btn');
    if (dlBtn) {
      dlBtn.addEventListener('click', function () {
        var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        var a    = document.createElement('a');
        a.href   = URL.createObjectURL(blob);
        a.download = 'README.md';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          document.body.removeChild(a);
          URL.revokeObjectURL(a.href);
        }, 100);
      });
    }
    chat.scrollTop = 0;
  }

  function renderError(msg) {
    var chat = document.getElementById('chat-messages');
    if (chat) {
      chat.innerHTML =
        '<div class="error-card">' +
          '<p class="error-title">Generation failed</p>' +
          '<p class="error-msg">' + esc(msg) + '</p>' +
        '</div>';
    }
  }

  function resetChatUI() {
    var chat = document.getElementById('chat-messages');
    if (chat) {
      chat.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">⌘</div>' +
          '<p class="empty-title">Upload your source code to get started</p>' +
          '<p class="empty-sub">$0.50 per README · Powered by Qwen-32B</p>' +
        '</div>';
    }
  }

  // ================================================================
  // WEB3 PAYMENT (Ethers v6)
  // ================================================================
  function payWithUSDT() {
    if (!currentUser) return toast('Please log in first.', 'error');
    if (typeof window.ethers === 'undefined') return toast('ethers.js not loaded.', 'error');
    if (!window.ethereum) return toast('MetaMask not detected.', 'error');

    var topupBtn   = document.getElementById('topup-btn');
    var walletAddr = null;
    if (topupBtn) topupBtn.disabled = true;
    setLoading(true, 'Connecting wallet…');

    window.ethereum.request({ method: 'eth_requestAccounts' })
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
        var badge = document.getElementById('wallet-badge');
        if (badge) {
          badge.textContent = addr.slice(0, 6) + '…' + addr.slice(-4);
          badge.style.display = 'block';
        }
        var netKey = (document.getElementById('crypto-network') || {}).value || 'bsc';
        var net    = CFG.networks[netKey];
        if (!net) throw new Error('Unknown network selected.');
        setLoading(true, 'Switching network…');
        return switchOrAddChain(net).then(function () { return { net: net, netKey: netKey }; });
      })
      .then(function (ctx) {
        ethProvider = new ethers.BrowserProvider(window.ethereum);
        return ethProvider.getSigner().then(function (s) { ethSigner = s; return ctx; });
      })
      .then(function (ctx) {
        setLoading(true, 'Checking USDT balance…');
        var contract = new ethers.Contract(ctx.net.usdtAddress, ERC20_ABI, ethSigner);
        var sendAmt  = ethers.parseUnits(CFG.topupUsdt, ctx.net.usdtDecimals);
        return contract.balanceOf(walletAddr).then(function (bal) {
          if (bal < sendAmt) {
            var have = parseFloat(ethers.formatUnits(bal, ctx.net.usdtDecimals)).toFixed(2);
            throw new Error('Insufficient USDT. Have $' + have + ', need $' + CFG.topupUsdt + '.');
          }
          setLoading(true, 'Confirm in MetaMask…');
          toast('Approve the transaction in MetaMask.', 'info');
          return contract.transfer(CFG.receiver, sendAmt).then(function (tx) {
            toast('Transaction sent. Waiting for confirmation…', 'info');
            setLoading(true, 'Waiting for on-chain confirmation…');
            return tx.wait(1).then(function (receipt) {
              return { receipt: receipt, netKey: ctx.netKey };
            });
          });
        });
      })
      .then(function (ctx) {
        if (ctx.receipt.status !== 1) throw new Error('Transaction reverted on-chain.');
        return addCredits(CFG.topupCredits).then(function (newBal) {
          db.from('transactions').insert([{
            user_id:     currentUser.id,
            type:        'topup',
            amount:      CFG.topupCredits,
            description: 'USDT top-up via ' + ctx.netKey,
            tx_hash:     ctx.receipt.hash,
          }]);
          setBalanceDisplay(newBal);
          toast('Payment confirmed! +$' + CFG.topupCredits.toFixed(2) + ' added.', 'success');
        });
      })
      .catch(function (e) {
        if (e.code === 4001 || (e.message && e.message.toLowerCase().includes('user rejected'))) {
          toast('Transaction cancelled.', 'info');
        } else {
          toast('Payment error: ' + (e.message || 'Unknown error'), 'error');
        }
      })
      .finally(function () {
        setLoading(false);
        if (topupBtn) topupBtn.disabled = false;
      });
  }

  function switchOrAddChain(net) {
    var hex = '0x' + net.chainId.toString(16);
    return window.ethereum
      .request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
      .catch(function (e) {
        if (e.code === 4902) {
          return window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: hex,
              chainName: net.chainName,
              nativeCurrency: net.nativeCurrency,
              rpcUrls: net.rpcUrls,
              blockExplorerUrls: net.blockExplorerUrls,
            }],
          });
        }
        throw e;
      });
  }

  // ================================================================
  // UI HELPERS
  // ================================================================
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function hide(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function setLoading(on, msg) {
    var overlay = document.getElementById('loading-overlay');
    var text    = document.getElementById('loading-text');
    if (!overlay) return;
    overlay.classList.toggle('visible', !!on);
    if (text && msg) text.textContent = msg;
  }

  function toast(msg, type, ms) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var t = document.createElement('div');
    t.className   = 'toast toast-' + (type || 'info');
    t.textContent = msg;
    container.appendChild(t);
    // Trigger entrance
    requestAnimationFrame(function () { t.classList.add('toast-enter'); });
    setTimeout(function () {
      t.classList.remove('toast-enter');
      t.classList.add('toast-exit');
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 300);
    }, ms || 4000);
  }

  // ================================================================
  // EXPOSE TO HTML onclick attributes
  // ================================================================
  window.showScreen        = showScreen;
  window.showAuth          = showAuth;
  window.toggleAuthMode    = toggleAuthMode;
  window.handleSignUp      = handleSignUp;
  window.handleSignIn      = handleSignIn;
  window.handleSignOut     = handleSignOut;
  window.payWithUSDT       = payWithUSDT;
  window.generateReadme    = generateReadme;
  window.copyAffiliateLink = copyAffiliateLink;

}());
