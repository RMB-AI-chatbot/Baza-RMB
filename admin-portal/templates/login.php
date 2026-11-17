<?php /** @var string|null $error @var string $csrf @var bool $secondStep */ ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in · RMB AI Assistant admin</title>
<link rel="stylesheet" href="/assets/app.css?v=9">
<script src="/assets/i18n.js?v=9"></script>
</head>
<body class="login-page">
  <main class="login-card">
    <div class="login-lang" role="group" aria-label="Language"><button type="button" data-setlang="en">EN</button><button type="button" data-setlang="fr">FR</button><button type="button" data-setlang="rw">RW</button></div>
    <div class="brand big"><img src="/assets/rmb-logo.png" alt="" data-fallback="/assets/logo.svg"><div><b>RMB</b><small>Rwanda Mines, Petroleum and Gas Board</small></div></div>
    <h1>AI Assistant administration</h1>
    <?php if ($secondStep): ?>
      <p class="muted">Enter the 6-digit code from your authenticator app.</p>
      <?php if ($error): ?><div class="alert"><?= htmlspecialchars($error) ?></div><?php endif; ?>
      <form method="post" action="/login">
        <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>">
        <label>Authentication code<input name="code" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7"
               autocomplete="one-time-code" required autofocus class="code-input"></label>
        <button class="btn primary wide" type="submit">Verify</button>
      </form>
      <p class="muted small"><a href="/login?restart=1">Use another account</a> · Lost your phone? Ask an RMB super admin to reset your two-factor sign-in.</p>
    <?php else: ?>
      <p class="muted">Sign in with your RMB staff account.</p>
      <?php if ($error): ?><div class="alert"><?= htmlspecialchars($error) ?></div><?php endif; ?>
      <form method="post" action="/login">
        <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>">
        <label>Email<input type="email" name="email" autocomplete="username" required autofocus></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn primary wide" type="submit">Sign in</button>
      </form>
      <p class="muted small">Forgot your password? Ask an RMB super admin for a temporary one.</p>
    <?php endif; ?>
    <p class="muted small">Access is restricted to authorised RMB personnel. Activity is logged.</p>
  </main>
  <script src="/assets/fallback.js?v=9"></script>
</body>
</html>
