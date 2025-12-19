// js/common.js

// 1. 共通の設定値
const CONFIG = {
    SERVER_BASE_URL: "https://test.unitemie.com",
    LIFF_ID_LIST: "2007688662-6dk5WiCy",
    LIFF_ID_DETAIL: "2007688662-oEf8sKgj"
};

// 2. ステータス定義（たけうち仕様！）
const REPORT_STATUS = {
    PENDING: "00",       // ⏳ 未処理
    APPROVED: "10",      // ✅ 承認済
    AUTO_APPROVED: "11", // 🤖 自動承認
    REJECTED: "20"       // ❌ 否認済
};

// 3. 共通のトースト表示機能
function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2000);
}

// 4. エラー表示の共通化（おまけ！）
function handleError(e) {
    console.error(e);
    alert("エラーが発生しました: " + e.message);
}