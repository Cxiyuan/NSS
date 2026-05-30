<?php
// Hashtopolis Server Configuration — 适配 John the Ripper Generic Cracker

define('HASHTOPOLIS_DB_HOST',     getenv('HASHTOPOLIS_DB_HOST') ?: 'db');
define('HASHTOPOLIS_DB_USER',     getenv('HASHTOPOLIS_DB_USER') ?: 'cypher');
define('HASHTOPOLIS_DB_PASS',     getenv('HASHTOPOLIS_DB_PASS') ?: 'cypher_pass');
define('HASHTOPOLIS_DB_DATABASE', getenv('HASHTOPOLIS_DB_DATABASE') ?: 'cypher');
define('HASHTOPOLIS_AGENT_TIMEOUT', 60);
define('HASHTOPOLIS_GENERIC_CRACKER_ENABLED', true);
define('HASHTOPOLIS_GENERIC_CRACKER_BINARY', 'python3');
define('HASHTOPOLIS_GENERIC_CRACKER_ARGS', '/opt/cypher/src/john_wrapper.py --serve');
define('HASHTOPOLIS_GENERIC_CRACKER_TIMEOUT', 3600);
