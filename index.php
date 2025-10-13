<?php
// Hauptseite - Weiterleitung zur Login-Seite
session_start();

// If role is already selected, redirect to dashboard
if (isset($_SESSION['role_selected']) && $_SESSION['role_selected']) {
    header('Location: dashboard.php');
    exit;
} else {
    // Redirect to role selection
    header('Location: login.php');
    exit;
}
?>
