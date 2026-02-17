// ⚠️ الإعدادات
const SUPABASE_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';

// إنشاء العميل باسم مختلف لتجنب تعارض المكتبة
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const authScreen = document.getElementById('auth-screen');
const dashScreen = document.getElementById('dashboard-screen');
const authMsg = document.getElementById('auth-msg');
const balanceDisplay = document.getElementById('balance');

let currentUser = null;

// 1. جعل الدوال متاحة للمتصفح
window.signUp = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) { authMsg.innerText = "Fill all fields"; return; }
    
    authMsg.innerText = "Creating account...";
    const { data, error } = await sb.auth.signUp({ email, password });
    
    if (error) authMsg.innerText = error.message;
    else authMsg.innerText = "Success! Please login.";
};

window.signIn = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) { authMsg.innerText = "Fill all fields"; return; }

    authMsg.innerText = "Checking...";
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    
    if (error) {
        authMsg.innerText = error.message;
    } else {
        currentUser = data.user;
        showDashboard();
    }
};

window.signOut = async () => {
    await sb.auth.signOut();
    location.reload(); 
};

// 2. جلب وتحديث الرصيد
async function fetchBalance() {
    const { data, error } = await sb
        .from('profiles')
        .select('credits')
        .eq('id', currentUser.id)
        .single();
    
    if (data) {
        balanceDisplay.innerText = `$${data.credits.toFixed(2)}`;
    }
}

// 3. إدارة التبديل بين الشاشات
function showDashboard() {
    authScreen.classList.add('hidden');
    dashScreen.classList.remove('hidden');
    fetchBalance();
}

// 4. التحقق من الجلسة عند فتح الموقع
sb.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        currentUser = session.user;
        showDashboard();
    }
});
