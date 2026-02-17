// ⚠️ الإعدادات (استخدمنا الأسماء التي زودتني بها)
const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';

// حل مشكلة التسمية: نستخدم 'client' بدلاً من 'supabase'
const client = window.supabase.createClient(DB_URL, DB_KEY);

const authScreen = document.getElementById('auth-screen');
const dashScreen = document.getElementById('dashboard-screen');
const authMsg = document.getElementById('auth-msg');
const balanceDisplay = document.getElementById('balance');

let user = null;

// 1. تعريف الدوال وربطها بالنافذة (لضمان عمل الـ onclick)
window.handleSignUp = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    authMsg.innerText = "Creating account...";
    const { error } = await client.auth.signUp({ email, password });
    if (error) authMsg.innerText = error.message;
    else authMsg.innerText = "Check your email!";
};

window.handleSignIn = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    authMsg.innerText = "Logging in...";
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) authMsg.innerText = error.message;
    else {
        user = data.user;
        showDashboard();
    }
};

window.handleSignOut = async () => {
    await client.auth.signOut();
    location.reload();
};

// 2. إدارة الواجهة والرصيد
async function showDashboard() {
    authScreen.classList.add('hidden');
    dashScreen.classList.remove('hidden');
    
    // جلب الرصيد من جدول Profiles
    const { data } = await client
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();
    
    if (data) balanceDisplay.innerText = `$${data.credits.toFixed(2)}`;
}

// 3. التحقق التلقائي عند التحميل
client.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        user = session.user;
        showDashboard();
    }
});
