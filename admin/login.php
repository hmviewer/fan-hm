<!DOCTYPE html>
<html lang="ko" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>THE HM 관리자</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="../tokens.css">
</head>
<body class="login-body">

<button class="theme-btn" id="themeBtn"><span id="themeIcon">🌙</span></button>

<div class="login-card">
    <div class="login-logo">
        <span class="logo-mark"></span>
        <div>
            <span class="logo-name">THE HM</span>
            <span class="logo-sub">Admin</span>
        </div>
    </div>
    <div class="login-divider"></div>

    
    <form method="POST" class="login-form">
        <div class="login-field">
            <label>비밀번호</label>
            <input type="password" name="password"
                   placeholder="비밀번호 입력" required autofocus>
        </div>
        <button type="submit" name="login" class="login-submit">로그인</button>
    </form>

    <a href="../index.php" class="login-back">← 메인으로 돌아가기</a>
</div>

<script>
(function(){
    const t = localStorage.getItem('the_hm_theme') || 'light';
    document.documentElement.setAttribute('data-theme', t);
    document.getElementById('themeIcon').textContent = t === 'dark' ? '☀️' : '🌙';
})();
document.getElementById('themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.getElementById('themeIcon').textContent = next === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('the_hm_theme', next);
});
</script>
</body>
</html>
