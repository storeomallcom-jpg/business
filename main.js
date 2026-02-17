// ==============================================
// MASTER OBJECT: App
// ==============================================
const App = {
    config: {
        supabaseUrl: 'https://kutmygkodxtfbtdtwqef.supabase.co', // رابطك
        supabaseAnonKey: 'ضع_هنا_الـ_Anon_Key_الخاص_بك', 
        apiEndpoint: 'api.php'
    },

    user: null,
    supabase: null,
    balance: 0,

    // --- AUTH MODULE ---
    Auth: {
        init: async function() {
            App.supabase = window.supabase.createClient(App.config.supabaseUrl, App.config.supabaseAnonKey);
            
            // مراقبة الجلسة الحالية
            const { data: { session } } = await App.supabase.auth.getSession();
            if (session) App.handleLogin(session.user);

            // مراقبة تغير حالة الدخول
            App.supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN') App.handleLogin(session.user);
                if (event === 'SIGNED_OUT') App.handleLogout();
            });
        },

        signUp: async (email, password) => {
            const { error } = await App.supabase.auth.signUp({ email, password });
            if (error) return App.UI.showAuthMsg(error.message);
            App.UI.showAuthMsg('تم إرسال رسالة تفعيل لبريدك!', 'green');
        },

        signIn: async (email, password) => {
            const { error } = await App.supabase.auth.signInWithPassword({ email, password });
            if (error) return App.UI.showAuthMsg(error.message);
        },

        signOut: async () => { await App.supabase.auth.signOut(); }
    },

    // --- UI MODULE ---
    UI: {
        init: function() {
            // ربط أزرار الواجهة
            document.getElementById('showAuthBtn').onclick = () => App.UI.toggleModal('authModal', true);
            document.getElementById('closeAuthModal').onclick = () => App.UI.toggleModal('authModal', false);
            document.getElementById('signInBtn').onclick = () => {
                const e = document.getElementById('email').value;
                const p = document.getElementById('password').value;
                App.Auth.signIn(e, p);
            };
            document.getElementById('signUpBtn').onclick = () => {
                const e = document.getElementById('email').value;
                const p = document.getElementById('password').value;
                App.Auth.signUp(e, p);
            };
            document.getElementById('logoutBtn').onclick = () => App.Auth.signOut();
        },

        toggleModal: (id, show) => {
            document.getElementById(id).classList.toggle('hidden', !show);
        },

        showAuthMsg: (msg, color = 'red') => {
            const el = document.getElementById('authMsg');
            el.innerText = msg;
            el.style.color = color === 'red' ? '#ff4d4d' : '#4dff4d';
        }
    },

    // --- HELPER FUNCTIONS ---
    handleLogin: function(user) {
        App.user = user;
        document.getElementById('landing').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        App.UI.toggleModal('authModal', false);
        console.log("User Logged In:", user.email);
        // هنا سنضيف لاحقاً: جلب الرصيد وتحديث رابط الأفلييت
    },

    handleLogout: function() {
        App.user = null;
        document.getElementById('landing').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('hidden');
        window.location.reload(); // لإعادة تصفير الحالة
    },

    init: function() {
        this.Auth.init();
        this.UI.init();
        console.log("App :: V11 Initialized");
    }
};

// تشغيل التطبيق
window.addEventListener('DOMContentLoaded', () => App.init());
