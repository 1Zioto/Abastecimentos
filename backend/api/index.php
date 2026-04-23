<?php
// api/index.php — Vercel PHP entry point for Laravel

// Set the document root for Vercel
$_SERVER['DOCUMENT_ROOT'] = __DIR__ . '/../public';

// Load the Laravel application
require __DIR__ . '/../public/index.php';
