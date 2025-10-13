<?php
// Einfache Login-Seite mit PHP für Fehlermeldungen und Session-Handling
session_start();

// Handle role selection
if ($_POST['role'] ?? false) {
    $role = $_POST['role'];
    if ($role === 'student' || $role === 'partner') {
        $_SESSION['isStudent'] = ($role === 'student');
        $_SESSION['role_selected'] = true;
        header('Location: dashboard.php');
        exit;
    }
}

// If role is already selected, redirect to dashboard
if (isset($_SESSION['role_selected']) && $_SESSION['role_selected']) {
    header('Location: dashboard.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rollenauswahl</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="login-container">
        <div class="logo">
            <h1>Willkommen</h1>
        </div>
        
        <form method="POST" class="login-form">
            <h2 class="login-title">Wer sind sie?</h2>
            
            <div class="role-selection">
                <div class="role-option">
                    <button type="submit" name="role" value="student" class="role-button student-btn">
                        <h3>Student</h3>
                    </button>
                </div><br>
                <div class="role-option">
                    <button type="submit" name="role" value="partner" class="role-button partner-btn">
                        <h3>Dualer Partner</h3>
                    </button>
                </div>
            </div>
        </form>
    </div>
</body>
</html>
