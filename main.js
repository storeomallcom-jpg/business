// ==============================================
// MASTER OBJECT: App
// Modular, secure, self-contained
// ==============================================
const App = {
    // ---------- CONFIG ----------
    config: {
        supabaseUrl: 'https://kutmygkodxtfbtdtwqef.supabase.co',
        supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE',
        apiEndpoint: '/api.php',   // same-origin, change if needed
        tokensPerLetter: 4,        // 1 token per 4 characters
        affiliatePercent: 0.1      // 10% commission
    },

    // ---------- STATE ----------
    user: null,
    supabase: null,
    provider: null,                // ethers provider
    walletAddress: null,
    balance: 0,

    // ---------- MODULES ----------
    Auth: {
        init: async function() {
            App.supabase = window.supabase.createClient(App.config.supabaseUrl, App.config.supabaseAnonKey);
            // Check existing session
            const { data: { session } } = await App.supabase.auth.getSession();
            if (session) {
                App.user = session.user;
                await App.UI.showDashboard();
                await App.Affiliate.checkAndSetReferrer(); // if ref in localStorage, link after login
            }
            // Listen to auth changes
            App.supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN') {
                    App.user = session.user;
                    App.UI.showDashboard();
                    App.Affiliate.checkAndSetReferrer();
                }
                if (event === 'SIGNED_OUT') {
                    App.user = null;
                    App.UI.showLanding();
                }
            });
        },

        signUp: async (email, password) => {
            const { error } = await App.supabase.auth.signUp({ email, password });
            if (error) return App.UI.showAuthMsg(error.message);
            App.UI.showAuthMsg('Check your email for confirmation!', 'green');
        },

        signIn: async (email, password) => {
            const { error } = await App.supabase.auth.signInWithPassword({ email, password });
            if (error) return App.UI.showAuthMsg(error.message);
            // onAuthStateChange will handle dashboard
        },

        signOut: async () => {
            await App.supabase.auth.signOut();
        }
    },

    // ---------- AFFILIATE ----------
    Affiliate: {
        // read ?ref= from URL, store in localStorage
        trackFromUrl: function() {
            const urlParams = new URLSearchParams(window.location.search);
            const ref = urlParams.get('ref');
            if (ref) {
                localStorage.setItem('affiliate_ref', ref);
                console.log('Affiliate ref stored:', ref);
            }
        },

        // after signup, call backend to set referred_by
        checkAndSetReferrer: async function() {
            if (!App.user) return;
            const ref = localStorage.getItem('affiliate_ref');
            if (!ref) return;

            try {
                const session = await App.supabase.auth.getSession();
                const token = session.data.session?.access_token;
                const res = await fetch(App.config.apiEndpoint + '?action=set_referrer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ referrer_id: ref })
                });
                const data = await res.json();
                if (data.success) localStorage.removeItem('affiliate_ref');
            } catch (e) { console.warn('affiliate set failed', e); }
        },

        getAffiliateLink: function() {
            if (!App.user) return '';
            return `${window.location.origin}?ref=${App.user.id}`;
        }
    },

    // ---------- ENGINE (AI CHAT) ----------
    Engine: {
        sendMessage: async function(prompt) {
            if (!App.user) return alert('Login first');
            const session = await App.supabase.auth.getSession();
            const token = session.data.session?.access_token;

            // show user message
            App.UI.addChatMessage('user', prompt);

            try {
                const res = await fetch(App.config.apiEndpoint + '?action=ai_chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ prompt })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                // AI response
                App.UI.addChatMessage('ai', data.reply);
                // update balance from backend response
                if (data.new_balance !== undefined) {
                    App.balance = data.new_balance;
                    App.UI.updateBalance();
                }
            } catch (err) {
                App.UI.addChatMessage('ai', 'Error: ' + err.message);
            }
        }
    },

    // ---------- BILLING (CRYPTO) ----------
    Billing: {
        connectWallet: async function() {
            if (!window.ethereum) return alert('Install MetaMask');
            try {
                App.provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await App.provider.send('eth_requestAccounts', []);
                App.walletAddress = accounts[0];
                App.UI.updateWalletInfo();
            } catch (e) {
                alert('Connection failed');
            }
        },

        // Simulate a payment, then call backend to verify
        purchaseTokens: async function(amount, crypto = 'POLYGON') {
            if (!App.walletAddress) return alert('Connect wallet first');
            if (!App.user) return alert('Login first');

            // In production, construct a transaction to a fixed address and amount
            // For demo, we simulate a txHash
            const txHash = '0x' + Math.random().toString(16).substring(2, 42);
            alert(`Demo: Sending ${amount} tokens. TxHash: ${txHash}`);

            const session = await App.supabase.auth.getSession();
            const token = session.data.session?.access_token;

            const res = await fetch(App.config.apiEndpoint + '?action=verify_payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ txHash, network: crypto, amount })
            });
            const data = await res.json();
            if (data.success) {
                App.balance = data.new_balance;
                App.UI.updateBalance();
                alert('Payment verified! Tokens added.');
            } else {
                alert('Verification failed: ' + data.error);
            }
        }
    },

    // ---------- REWARDS (SOCIAL) ----------
    Rewards: {
        claim: async function(platform) {
            if (!App.user) return alert('Login first');
            const session = await App.supabase.auth.getSession();
            const token = session.data.session?.access_token;

            const res = await fetch(App.config.apiEndpoint + '?action=claim_social_reward', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ platform })
            });
            const data = await res.json();
            if (data.success) {
                App.balance = data.new_balance;
                App.UI.updateBalance();
                alert(`Reward claimed! +${data.amount} tokens`);
            } else {
                alert(data.error);
            }
        }
    },

    // ---------- UI CONTROLLER ----------
    UI: {
        init: function() {
            // bind buttons
            document.getElementById('showAuthBtn')?.addEventListener('click', () => App.UI.showAuthModal());
            document.getElementById('showAuthBtn2')?.addEventListener('click', () => App.UI.showAuthModal());
            document.getElementById('closeAuthModal')?.addEventListener('click', () => App.UI.hideAuthModal());
            document.getElementById('signUpBtn')?.addEventListener('click', () => {
                const email = document.getElementById('email').value;
                const pwd = document.getElementById('password').value;
                App.Auth.signUp(email, pwd);
            });
            document.getElementById('signInBtn')?.addEventListener('click', () => {
                const email = document.getElementById('email').value;
                const pwd = document.getElementById('password').value;
                App.Auth.signIn(email, pwd);
            });
            document.getElementById('logoutBtn')?.addEventListener('click', () => App.Auth.signOut());

            // chat
            document.getElementById('sendChatBtn')?.addEventListener('click', () => {
                const inp = document.getElementById('chatInput');
                if (inp.value.trim()) {
                    App.Engine.sendMessage(inp.value);
                    inp.value = '';
                }
            });
            document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') document.getElementById('sendChatBtn').click();
            });

            // wallet
            document.getElementById('connectWalletBtn')?.addEventListener('click', () => App.Billing.connectWallet());

            // rewards (simple)
            document.getElementById('claimYtBtn')?.addEventListener('click', () => App.Rewards.claim('youtube'));
            document.getElementById('claimIgBtn')?.addEventListener('click', () => App.Rewards.claim('instagram'));

            // update affiliate link if logged in later
        },

        showAuthModal: function() {
            document.getElementById('authModal').style.display = 'flex';
        },
        hideAuthModal: function() {
            document.getElementById('authModal').style.display = 'none';
        },
        showAuthMsg: function(msg, color = 'red') {
            const el = document.getElementById('authMsg');
            el.innerText = msg;
            el.style.color = color;
        },

        showDashboard: async function() {
            document.getElementById('landing').style.display = 'none';
            document.getElementById('dashboard').style.display = 'flex';
            document.getElementById('dashboard').classList.add('active');
            this.hideAuthModal();
            await this.fetchBalance();
            this.updateAffiliateLink();
        },

        showLanding: function() {
            document.getElementById('landing').style.display = 'block';
            document.getElementById('dashboard').style.display = 'none';
            document.getElementById('dashboard').classList.remove('active');
        },

        fetchBalance: async function() {
            if (!App.user) return;
            const session = await App.supabase.auth.getSession();
            const token = session.data.session?.access_token;
            const res = await fetch(App.config.apiEndpoint + '?action=get_balance', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.balance !== undefined) {
                App.balance = data.balance;
                this.updateBalance();
            }
        },

        updateBalance: function() {
            document.getElementById('balance').innerText = App.balance.toFixed(2);
        },

        updateWalletInfo: function() {
            document.getElementById('walletInfo').innerText = App.walletAddress ? 
                `Connected: ${App.walletAddress.slice(0,6)}...${App.walletAddress.slice(-4)}` : '';
        },

        updateAffiliateLink: function() {
            const link = App.Affiliate.getAffiliateLink();
            document.getElementById('refLink').innerText = link || 'Login to see';
        },

        addChatMessage: function(role, text) {
            const container = document.getElementById('chatMessages');
            const msgDiv = document.createElement('div');
            msgDiv.className = `p-3 rounded-xl max-w-[80%] ${role === 'user' ? 'bg-blue-600/40 self-end ml-auto' : 'bg-gray-700/40'}`;
            msgDiv.innerText = text;
            container.appendChild(msgDiv);
            container.scrollTop = container.scrollHeight;
        }
    },

    // ---------- BOOTSTRAP ----------
    init: function() {
        // Track affiliate from URL first
        this.Affiliate.trackFromUrl();
        // Initialize Supabase Auth
        this.Auth.init();
        // Initialize UI bindings
        this.UI.init();
        console.log('App :: initialized');
    }
};

// Start everything
window.addEventListener('DOMContentLoaded', () => App.init());
