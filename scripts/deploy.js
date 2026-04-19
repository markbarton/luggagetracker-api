#!/usr/bin/env node

const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const readline = require('readline')

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`)
}

function error(message) {
    log(`ERROR: ${message}`, 'red')
    process.exit(1)
}

function loadConfig() {
    const configPath = path.resolve(__dirname, '../deploy.config.json')
    if (!fs.existsSync(configPath)) {
        error('deploy.config.json not found. Please create it first.')
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

function getProjectName() {
    const pkgPath = path.resolve(__dirname, '../package.json')
    if (!fs.existsSync(pkgPath)) {
        error('package.json not found. Cannot determine project name.')
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    if (!pkg.name) {
        error('package.json has no "name" field. Cannot verify deployment target.')
    }
    return pkg.name
}

function assertRemotePathMatchesProject(server, projectName) {
    if (!server.remotePath.includes(projectName)) {
        error(
            `Safety check failed: remotePath "${server.remotePath}" does not contain project name "${projectName}". ` +
            `Refusing to deploy — this could overwrite a different project.`
        )
    }
}

const SENTINEL_FILE = '.deploy-project'

function sshExec(server, remoteCmd) {
    const privateKey = expandPath(server.privateKeyPath)
    const sshCmd = `ssh -i "${privateKey}" -p ${server.port} -o BatchMode=yes -o StrictHostKeyChecking=accept-new ${server.username}@${server.host} ${JSON.stringify(remoteCmd)}`
    return execSync(sshCmd, { encoding: 'utf8' })
}

async function verifySentinel(server, projectName, options = {}) {
    const remoteRoot = server.remotePath.replace(/\/+$/, '')
    const sentinelPath = `${remoteRoot}/${SENTINEL_FILE}`
    const checkCmd = `if [ -d "${remoteRoot}" ]; then if [ -f "${sentinelPath}" ]; then echo "EXISTS:$(cat "${sentinelPath}" 2>/dev/null)"; elif [ -z "$(ls -A "${remoteRoot}" 2>/dev/null)" ]; then echo "EMPTY"; else echo "POPULATED_NO_SENTINEL"; fi; else echo "MISSING_DIR"; fi`

    let result
    try {
        result = sshExec(server, checkCmd).trim()
    } catch (err) {
        error(`Sentinel check failed (SSH error): ${err.message}`)
    }

    if (result.startsWith('EXISTS:')) {
        const remoteProject = result.slice('EXISTS:'.length).trim()
        if (remoteProject !== projectName) {
            error(
                `Sentinel mismatch: remote ${sentinelPath} contains "${remoteProject}" but this project is "${projectName}". ` +
                `Hard abort — refusing to deploy over a different project.`
            )
        }
        log(`Sentinel verified: ${sentinelPath} -> ${remoteProject}`, 'green')
        return
    }

    if (result === 'MISSING_DIR' || result === 'EMPTY') {
        log(`\nNo existing deployment found at ${server.remotePath}.`, 'yellow')
        if (options.yes) {
            log('Creating sentinel (--yes supplied)...', 'yellow')
        } else {
            const ok = await confirm(`Create sentinel "${SENTINEL_FILE}" containing "${projectName}" here?`)
            if (!ok) {
                log('Deployment cancelled.', 'yellow')
                process.exit(0)
            }
        }
        try {
            const safeName = projectName.replace(/'/g, "'\\''")
            sshExec(server, `mkdir -p "${remoteRoot}" && printf '%s' '${safeName}' > "${sentinelPath}"`)
            const written = sshExec(server, `cat "${sentinelPath}"`).trim()
            if (written !== projectName) {
                error(`Sentinel write verification failed: wrote "${projectName}" but read back "${written}"`)
            }
            log(`Sentinel written: ${sentinelPath} -> ${written}`, 'green')
        } catch (err) {
            error(`Failed to write sentinel: ${err.message}`)
        }
        return
    }

    if (result === 'POPULATED_NO_SENTINEL') {
        error(
            `Remote ${server.remotePath} contains files but no ${SENTINEL_FILE}. ` +
            `Hard abort — cannot confirm this directory belongs to "${projectName}". ` +
            `If this is intentional, manually create ${sentinelPath} with contents "${projectName}" and retry.`
        )
    }

    error(`Unexpected sentinel-check response: ${result}`)
}

async function confirmProjectName(projectName) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    return new Promise(resolve => {
        rl.question(
            `${colors.yellow}Type the project name "${projectName}" to confirm destructive sync: ${colors.reset}`,
            answer => {
                rl.close()
                resolve(answer.trim() === projectName)
            }
        )
    })
}

function getCurrentBranch() {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
    } catch {
        error('Not a git repository or git not installed')
    }
}

function getGitStatus() {
    try {
        const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
        return status.length > 0
    } catch {
        return false
    }
}

function getLastCommit() {
    try {
        return execSync('git log -1 --pretty=format:"%h - %s (%cr)"', { encoding: 'utf8' }).trim()
    } catch {
        return 'Unknown'
    }
}

function expandPath(filePath) {
    if (filePath.startsWith('~')) {
        return path.join(os.homedir(), filePath.slice(1))
    }
    return filePath
}

function buildExcludeArgs(excludePatterns) {
    return excludePatterns.map(pattern => `--exclude='${pattern}'`).join(' ')
}

async function confirm(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    return new Promise(resolve => {
        rl.question(`${colors.yellow}${question} (y/N): ${colors.reset}`, answer => {
            rl.close()
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
        })
    })
}

function timestamp() {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

async function backupRemote(serverName, options = {}) {
    const config = loadConfig()
    const projectName = getProjectName()
    const server = config.servers[serverName]
    if (!server) error(`Server configuration not found: ${serverName}`)

    assertRemotePathMatchesProject(server, projectName)

    const privateKey = expandPath(server.privateKeyPath)
    const excludeArgs = buildExcludeArgs(config.exclude)
    const backupRoot = options.backupPath
        ? expandPath(options.backupPath)
        : path.resolve(__dirname, '../backups')
    const backupDir = path.join(backupRoot, serverName, timestamp())

    log('\nBackup Details:', 'blue')
    log(`  Source:  ${server.username}@${server.host}:${server.remotePath}`)
    log(`  Local:   ${backupDir}`)

    if (options.dryRun) {
        log('DRY RUN - backup skipped', 'yellow')
        return backupDir
    }

    fs.mkdirSync(backupDir, { recursive: true })

    const remoteSpec = `${server.username}@${server.host}:"${server.remotePath}/"`
    const rsyncCmd = `rsync -avz --progress ${excludeArgs} -e "ssh -i '${privateKey}' -p ${server.port}" ${remoteSpec} "${backupDir}/"`

    log('\nBacking up remote to local...', 'blue')
    try {
        execSync(rsyncCmd, { stdio: 'inherit' })
        log(`Backup complete: ${backupDir}`, 'green')
    } catch (err) {
        error(`Backup rsync failed: ${err.message}`)
    }
    return backupDir
}

async function deploy(targetServer = null, options = {}) {
    const config = loadConfig()
    const projectName = getProjectName()
    const currentBranch = getCurrentBranch()
    const hasUncommittedChanges = getGitStatus()
    const lastCommit = getLastCommit()

    log('\n========================================', 'cyan')
    log('  DEPLOYMENT SCRIPT', 'cyan')
    log('========================================\n', 'cyan')

    // Determine target server
    let serverName = targetServer
    if (!serverName) {
        serverName = config.branches[currentBranch]
        if (!serverName) {
            log(`No server mapping found for branch: ${currentBranch}`, 'yellow')
            log('Available mappings:', 'yellow')
            Object.entries(config.branches).forEach(([branch, server]) => {
                log(`  ${branch} -> ${server}`, 'yellow')
            })
            log('\nUse --server <name> to specify target manually', 'yellow')
            process.exit(1)
        }
    }

    const server = config.servers[serverName]
    if (!server) {
        error(`Server configuration not found: ${serverName}`)
    }

    // Layer 1: remote path must contain project name
    assertRemotePathMatchesProject(server, projectName)

    // Display deployment info
    const buildCfgInfo = server.build || config.build
    log('Deployment Details:', 'blue')
    log(`  Project:     ${projectName}`)
    log(`  Branch:      ${currentBranch}`)
    log(`  Target:      ${serverName}`)
    log(`  Server:      ${server.host}`)
    log(`  Remote Path: ${server.remotePath}`)
    log(`  Last Commit: ${lastCommit}`)
    if (buildCfgInfo && buildCfgInfo.command) {
        log(`  Build:       ${buildCfgInfo.command} -> ${buildCfgInfo.output || '(repo root)'}`)
    }

    if (hasUncommittedChanges) {
        log('\n  WARNING: You have uncommitted changes!', 'yellow')
    }

    log('')

    // Layer 2: verify/create remote sentinel file
    if (!options.dryRun) {
        await verifySentinel(server, projectName, options)
    } else {
        log('DRY RUN - sentinel check skipped', 'yellow')
    }

    // Confirm deployment — require typing project name because rsync uses --delete
    if (!options.yes) {
        const nameOk = await confirmProjectName(projectName)
        if (!nameOk) {
            log('Project name mismatch — deployment cancelled.', 'yellow')
            process.exit(0)
        }
    }

    log('\nStarting deployment...', 'green')

    if (options.backup) {
        await backupRemote(serverName, options)
    }

    // Optional local build step (e.g. Vite/React static apps)
    const repoRoot = path.resolve(__dirname, '../')
    const buildCfg = server.build || config.build
    if (buildCfg && buildCfg.command && !options.dryRun && !options.skipBuild) {
        log(`\nRunning build: ${buildCfg.command}`, 'blue')
        try {
            execSync(buildCfg.command, { stdio: 'inherit', cwd: repoRoot })
            log('Build complete.', 'green')
        } catch (err) {
            error(`Build failed: ${err.message}`)
        }
    }

    // Build rsync command — always exclude the sentinel so --delete doesn't remove it
    const privateKey = expandPath(server.privateKeyPath)
    const excludeList = [...(config.exclude || []), SENTINEL_FILE]
    const excludeArgs = buildExcludeArgs(excludeList)
    const sourceDir = buildCfg && buildCfg.output
        ? path.resolve(repoRoot, buildCfg.output)
        : repoRoot
    if (buildCfg && buildCfg.output && !fs.existsSync(sourceDir) && !options.dryRun) {
        error(`Build output not found: ${sourceDir}`)
    }
    const localPath = sourceDir + '/'

    const rsyncCmd = `rsync -avz --progress --delete ${excludeArgs} -e "ssh -i '${privateKey}' -p ${server.port}" "${localPath}" ${server.username}@${server.host}:"${server.remotePath}"`

    log('\nSyncing files...', 'blue')
    if (options.dryRun) {
        log('DRY RUN - would execute:', 'yellow')
        log(rsyncCmd)
    } else {
        try {
            execSync(rsyncCmd, { stdio: 'inherit' })
            log('Files synced successfully!', 'green')
        } catch (err) {
            error(`rsync failed: ${err.message}`)
        }
    }

    // Run post-deploy commands
    if (config.postDeploy && config.postDeploy.commands && !options.dryRun) {
        log('\nRunning post-deploy commands...', 'blue')

        for (const cmd of config.postDeploy.commands) {
            // Replace all server config placeholders
            let remoteCmd = cmd
                .replace(/{remotePath}/g, server.remotePath)
                .replace(/{pm2Name}/g, server.pm2Name || 'app')
                .replace(/{nodeEnv}/g, server.nodeEnv || 'production')
                .replace(/{host}/g, server.host)
                .replace(/{port}/g, server.port)

            const sshCmd = `ssh -i ${privateKey} -p ${server.port} ${server.username}@${server.host} "${remoteCmd}"`

            log(`  Executing: ${remoteCmd}`, 'cyan')
            try {
                execSync(sshCmd, { stdio: 'inherit' })
            } catch (err) {
                log(`  Warning: Command failed - ${err.message}`, 'yellow')
            }
        }
    }

    log('\n========================================', 'green')
    log('  DEPLOYMENT COMPLETE!', 'green')
    log('========================================\n', 'green')
}

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2)
    const options = {
        server: null,
        dryRun: false,
        yes: false,
        help: false,
        list: false,
        ssh: null,
        logs: false,
        status: false,
        backup: false,
        backupOnly: false,
        backupPath: null,
        skipBuild: false
    }

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--server':
            case '-s':
                options.server = args[++i]
                break
            case '--dry-run':
            case '-d':
                options.dryRun = true
                break
            case '--yes':
            case '-y':
                options.yes = true
                break
            case '--help':
            case '-h':
                options.help = true
                break
            case '--list':
            case '-l':
                options.list = true
                break
            case '--ssh':
                options.ssh = args[++i]
                break
            case '--logs':
                options.logs = true
                break
            case '--status':
                options.status = true
                break
            case '--backup':
                options.backup = true
                break
            case '--backup-only':
                options.backupOnly = true
                break
            case '--backup-path':
                options.backupPath = args[++i]
                break
            case '--skip-build':
                options.skipBuild = true
                break
            default:
                if (!args[i].startsWith('-')) {
                    options.server = args[i]
                }
        }
    }

    return options
}

function showHelp() {
    log(`
Usage: npm run deploy [options] [server]

Options:
  -s, --server <name>   Deploy to specific server (overrides branch mapping)
  -d, --dry-run         Show what would be deployed without actually deploying
  -y, --yes             Skip confirmation prompt
  -l, --list            List available servers and branch mappings
  -h, --help            Show this help message
  --ssh "<command>"     Run a shell command on the remote server
  --logs                View pm2 logs for the app on remote server
  --status              View pm2 status on remote server
  --backup              Pull a backup of the remote target (respecting excludes) before deploying
  --backup-only         Pull a backup of the remote target and exit (no deploy)
  --backup-path <dir>   Override local backup root (default: ./backups)
  --skip-build          Skip the local build step (static/Vite apps only)

Examples:
  npm run deploy                              Deploy based on current branch
  npm run deploy production                   Deploy to production server
  npm run deploy -- --dry-run                 Preview deployment
  npm run deploy -- -s beta -y                Deploy to beta without confirmation
  npm run deploy beta -- --ssh "pm2 list"     Run command on beta server
  npm run deploy beta -- --logs               View logs on beta server
  npm run deploy beta -- --status             View pm2 status on beta
  npm run deploy beta -- --backup             Backup beta, then deploy
  npm run deploy beta -- --backup-only        Backup beta only (no deploy)
`)
}

function listServers() {
    const config = loadConfig()

    log('\nBranch Mappings:', 'blue')
    Object.entries(config.branches).forEach(([branch, server]) => {
        log(`  ${branch} -> ${server}`)
    })

    log('\nAvailable Servers:', 'blue')
    Object.entries(config.servers).forEach(([name, server]) => {
        log(`  ${name}:`)
        log(`    Host: ${server.host}`)
        log(`    Path: ${server.remotePath}`)
        log(`    PM2:  ${server.pm2Name || 'app'}`)
        log(`    Env:  ${server.nodeEnv || 'production'}`)
    })
    log('')
}

function runRemoteCommand(serverName, command) {
    const config = loadConfig()
    const server = config.servers[serverName]

    if (!server) {
        error(`Server configuration not found: ${serverName}`)
    }

    const privateKey = expandPath(server.privateKeyPath)

    // Replace placeholders in command
    const remoteCmd = command
        .replace(/{remotePath}/g, server.remotePath)
        .replace(/{pm2Name}/g, server.pm2Name || 'app')
        .replace(/{nodeEnv}/g, server.nodeEnv || 'production')

    const sshCmd = `ssh -i ${privateKey} -p ${server.port} ${server.username}@${server.host} "${remoteCmd}"`

    log(`\nExecuting on ${serverName} (${server.host}):`, 'blue')
    log(`  ${remoteCmd}`, 'cyan')
    log('')

    try {
        execSync(sshCmd, { stdio: 'inherit' })
    } catch (err) {
        log(`Command failed: ${err.message}`, 'red')
        process.exit(1)
    }
}

// Main
const options = parseArgs()

if (options.help) {
    showHelp()
    process.exit(0)
}

if (options.list) {
    listServers()
    process.exit(0)
}

// Handle remote command execution
if (options.ssh || options.logs || options.status) {
    const config = loadConfig()
    const currentBranch = getCurrentBranch()
    const serverName = options.server || config.branches[currentBranch]

    if (!serverName) {
        error('No server specified. Use --server <name> or be on a mapped branch.')
    }

    if (options.logs) {
        const server = config.servers[serverName]
        runRemoteCommand(serverName, `pm2 logs ${server.pm2Name || 'app'} --lines 50`)
    } else if (options.status) {
        runRemoteCommand(serverName, 'pm2 status')
    } else {
        runRemoteCommand(serverName, options.ssh)
    }
    process.exit(0)
}

if (options.backupOnly) {
    const config = loadConfig()
    const currentBranch = getCurrentBranch()
    const serverName = options.server || config.branches[currentBranch]
    if (!serverName) {
        error('No server specified. Use --server <name> or be on a mapped branch.')
    }
    backupRemote(serverName, options).catch(err => error(err.message))
} else {
    deploy(options.server, options).catch(err => {
        error(err.message)
    })
}
