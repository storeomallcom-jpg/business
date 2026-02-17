const DB_URL = 'https://kutmygkodxtfbtdtwqef.supabase.co';
const DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dG15Z2tvZHh0ZmJ0ZHR3cWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTY4MzQsImV4cCI6MjA4Njg3MjgzNH0.LDd6RFbjSjF6QYqi__f7zK1oI8Ze7sa1Vv-1t2TLtkE'; // استبدله بمفتاحك

const client = window.supabase.createClient(DB_URL, DB_KEY);

const authScreen = document.getElementById('auth-screen');
const dashScreen = document.getElementById('dashboard-screen');
const authMsg = document.getElementById('auth-msg');
const balanceDisplay = document.getElementById('balance');
const affDisplay = document.getElementById('aff-link-display');

let user = null;

// 1. تتبع رابط الأفلييت فور فتح الصفحة
function trackReferral() {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
        localStorage.setItem('ds_referrer', ref);
        console.log("Referrer tracked:", ref);
    }
}
trackReferral();

// 2. تسجيل حساب جديد مع ربط الأفلييت
window.handleSignUp = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const referrerId = localStorage.getItem('ds_referrer'); // جلب المحيل من الذاكرة

    if(!email || !password) return authMsg.innerText = "Missing fields!";
    
    authMsg.innerText = "Creating account...";
    
    // تسجيل المستخدم في نظام Auth مع إضافة المحيل في الـ metadata
    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
            data: { referrer_id: referrerId }
        }
    });

    if (error) {
        authMsg.innerText = error.message;
    } else {
        authMsg.innerText = "Success! Verify your email.";
        // ملاحظة: الربط الحقيقي يتم في الـ Database عبر Trigger أو تحديث البروفايل لاحقاً
    }
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

async function showDashboard() {
    authScreen.classList.add('hidden');
    dashScreen.classList.remove('hidden');
    
    // عرض رابط الأفلييت الخاص بالمستخدم
    const myRefLink = `${window.location.origin}${window.location.pathname}?ref=${user.id}`;
    if(affDisplay) affDisplay.innerText = myRefLink;

    // جلب بيانات الرصيد
    const { data, error } = await client
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();
    
    if (data) {
        balanceDisplay.innerText = `$${data.credits.toFixed(2)}`;
    } else {
        console.error("Profile not found. Make sure SQL Triggers are set.");
    }
}

window.handleSignOut = async () => {
    await client.auth.signOut();
    location.reload();
};

// فحص الجلسة عند البداية
client.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        user = session.user;
        showDashboard();
    }
});
