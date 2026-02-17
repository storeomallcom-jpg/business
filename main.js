// ⚠️ هام جداً: ضع مفاتيح Supabase الخاصة بك هنا
const SUPABASE_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// عناصر الواجهة
const authScreen = document.getElementById('auth-screen');
const dashScreen = document.getElementById('dashboard-screen');
const authMsg = document.getElementById('auth-msg');
const balanceDisplay = document.getElementById('balance');

let currentUser = null;

// 1. التحقق من حالة الدخول عند تحميل الصفحة
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        showDashboard();
    } else {
        showAuth();
    }
}

// 2. دوال التسجيل والدخول
async function signUp() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    authMsg.innerText = "Processing...";
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) authMsg.innerText = error.message;
    else authMsg.innerText = "Success! Check your email or login now.";
}

async function signIn() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    authMsg.innerText = "Processing...";
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        authMsg.innerText = error.message;
    } else {
        currentUser = data.user;
        showDashboard();
    }
}

async function signOut() {
    await supabase.auth.signOut();
    currentUser = null;
    showAuth();
}

// 3. جلب الرصيد من جدول Profiles
async function fetchBalance() {
    const { data, error } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', currentUser.id)
        .single();
    
    if (data) {
        balanceDisplay.innerText = data.credits.toFixed(2);
    }
}

// 4. دالة لاختبار خصم الرصيد (Engine Trigger Simulation)
async function deductCredit() {
    let currentBalance = parseFloat(balanceDisplay.innerText);
    if (currentBalance < 0.05) {
        alert("Not enough credits!");
        return;
    }
    
    // خصم 0.05 من قاعدة البيانات
    const { error } = await supabase
        .from('profiles')
        .update({ credits: currentBalance - 0.05 })
        .eq('id', currentUser.id);

    if (!error) {
        fetchBalance(); // تحديث الواجهة
    } else {
        alert("Error updating balance.");
    }
}

// التبديل بين الشاشات
function showAuth() {
    authScreen.classList.remove('hidden');
    dashScreen.classList.add('hidden');
}

function showDashboard() {
    authScreen.classList.add('hidden');
    dashScreen.classList.remove('hidden');
    fetchBalance();
}

// تشغيل التحقق عند البداية
checkSession();
