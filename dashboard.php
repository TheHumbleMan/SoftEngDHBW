<?php
session_start();

// Check if role is selected, if not redirect to role selection
if (!isset($_SESSION['role_selected']) || !$_SESSION['role_selected']) {
    header('Location: login.php');
    exit;
}

// Get the user role
$isStudent = $_SESSION['isStudent'] ?? false;
$userRole = $isStudent ? 'Student' : 'Dualer Partner';

// Handle logout
if ($_POST['logout'] ?? false) {
    session_destroy();
    header('Location: index.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="dashboard-container">
        <!-- Header -->
        <div class="header">
            <div>
                <h1>Dashboard - DHBW</h1>
                <p>Willkommen, <?php echo htmlspecialchars($userRole); ?>!</p>
            </div>
            <div class="nav-links">
                <form method="POST" style="display: inline;">
                    <button type="submit" name="logout" value="1" class="logout-btn">Abmelden</button>
                </form>
            </div>
        </div>

        <!-- Schnell-Aktionen -->
        <div class="quick-actions">
            <h3>Schnellzugriff</h3>
            <?php if ($isStudent): ?>
            <div class="action-buttons-layout">
                <a href="test1_panel.php" class="action-btn">
                    Test1
                </a>
            </div>
            <?php else: ?>
            <div class="action-buttons-layout">
                <a href="test2_panel.php" class="action-btn">
                    Test2
                </a>
            </div>
            <?php endif; ?>
        </div>

        <!-- Dashboard-Karten -->
        <div class="dashboard-grid">

            <!-- Student Panel -->
            <?php if ($isStudent): ?>
            <div class="dashboard-card">
                <h2 class="card-title">Testpanel</h2>
                <p class="card-description">
                    Einfach loslassen
                </p>
                <a href="test1_panel.php" class="card-button">
                    Zum Test1-Panel
                </a>
            </div>
            <?php else: ?>
            <!-- Dualer Partner Panel -->
            <div class="dashboard-card">
                <h2 class="card-title">Testpanel</h2>
                <p class="card-description">
                    DHBW - gut durchdacht, schlecht gemacht
                </p>
                <a href="test2_panel.php" class="card-button">
                    Zum Test2-Panel
                </a>
            </div>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
