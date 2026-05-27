#!/usr/bin/env python3
"""
Hermes <-> Paperclip Seamless Bridge
Usage: python3 paperclip-hermes-bridge.py <command> [args]

Commands:
  list-agents                  List all agents and their status
  agent-status <agent-name>    Get detailed status of a specific agent
  assign <agent-name> <task>   Create and assign an issue to an agent
  issues [--status STATUS]     List issues (optionally filter by status)
  issue-status <issue-id>      Get detailed issue status
  update-issue <issue-id> <status>  Update issue status (todo, in_progress, done, etc.)
  message <agent-name> <msg>   Send a message/comment to an agent's current issue
  poll <issue-id>              Poll an issue until it's done (blocks)
  run <agent-name> <task>      Full cycle: create issue, assign, poll until done, return result
  broadcast <task>             Create an unassigned issue for the whole team
  team-status                  Quick health check of all agents
  preview <issue-id>           Detect project type in workspace and start dev server, return URL
  serve <project-path>         Start a dev server for a local project and return the URL
"""
import sys, json, urllib.request, urllib.error, time, argparse, os, subprocess, socket, re

BASE = "http://localhost:3100/api"
COMPANY = "39909fad-4bf8-4302-8093-d3bf8235a881"

# Project type detection patterns
PROJECT_TYPES = {
    "vite": {
        "files": ["vite.config.ts", "vite.config.js", "vite.config.mjs"],
        "commands": ["npm run dev", "pnpm dev", "yarn dev"],
        "default_port": 5173,
        "url_path": "/",
    },
    "nextjs": {
        "files": ["next.config.ts", "next.config.js", "next.config.mjs"],
        "commands": ["npm run dev", "pnpm dev", "yarn dev"],
        "default_port": 3000,
        "url_path": "/",
    },
    "tauri": {
        "files": ["src-tauri/tauri.conf.json", "tauri.conf.json"],
        "commands": ["npm run tauri dev", "pnpm tauri dev", "yarn tauri dev"],
        "default_port": 1420,
        "url_path": "/",
    },
    "react-scripts": {
        "files": [],  # Detected by package.json scripts
        "commands": ["npm start", "pnpm start", "yarn start"],
        "default_port": 3000,
        "url_path": "/",
    },
    "static": {
        "files": ["index.html"],
        "commands": ["python3 -m http.server", "npx serve .", "python -m http.server"],
        "default_port": 8000,
        "url_path": "/",
    },
}

def api(method, path, data=None):
    url = f"{BASE}{path}"
    req = urllib.request.Request(url, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode(), "status": e.code}
    except Exception as e:
        return {"error": str(e)}

def get_agents():
    result = api("GET", f"/companies/{COMPANY}/agents")
    if isinstance(result, list):
        return result
    if isinstance(result, dict) and "error" in result:
        print(f"Error fetching agents: {result['error']}")
        return []
    return result if isinstance(result, list) else []

def get_agent_by_name(name):
    agents = get_agents()
    name_lower = name.lower()
    for a in agents:
        if isinstance(a, dict) and (a.get('name', '').lower() == name_lower or a.get('role', '').lower() == name_lower):
            return a
    # Fuzzy match
    for a in agents:
        if isinstance(a, dict) and (name_lower in a.get('name', '').lower() or name_lower in a.get('role', '').lower()):
            return a
    return None

def list_agents():
    agents = get_agents()
    print(f"{'Agent Name':<30} {'Role':<15} {'Status':<10} {'Adapter':<15} {'Last Heartbeat'}")
    print("-" * 90)
    for a in agents:
        if not isinstance(a, dict):
            continue
        hb = a.get('lastHeartbeatAt', 'never')[:19] if a.get('lastHeartbeatAt') else 'never'
        print(f"{a.get('name','?'):<30} {a.get('role','?'):<15} {a.get('status','?'):<10} {a.get('adapterType','?'):<15} {hb}")

def agent_status(name):
    agent = get_agent_by_name(name)
    if not agent:
        print(f"Agent '{name}' not found")
        return
    print(json.dumps(agent, indent=2))

def assign(agent_name, task, title=None):
    agent = get_agent_by_name(agent_name)
    if not agent:
        print(f"Agent '{agent_name}' not found. Available agents:")
        list_agents()
        return None
    issue_title = title or task[:80]
    issue = api("POST", f"/companies/{COMPANY}/issues", {
        "title": issue_title,
        "description": task,
        "status": "todo",
        "assigneeAgentId": agent['id']
    })
    if 'error' in issue:
        print(f"Error creating issue: {issue['error']}")
        return None
    print(f"CREATED | Issue: {issue['id']} | Assigned to: {agent['name']} | Status: {issue['status']}")
    return issue

def list_issues(status=None):
    path = f"/companies/{COMPANY}/issues"
    if status:
        path += f"?status={status}"
    items = api("GET", path)
    if not isinstance(items, list):
        print(f"Error: {items}")
        return
    print(f"{'Issue ID':<36} {'Status':<12} {'Assignee':<20} {'Title'}")
    print("-" * 110)
    for i in items:
        if not isinstance(i, dict):
            continue
        assignee = i.get('assigneeAgentId', 'unassigned')[:18] if i.get('assigneeAgentId') else 'unassigned'
        print(f"{i.get('id','?'):<36} {i.get('status','?'):<12} {assignee:<20} {i.get('title','')[:50]}")

def issue_status(issue_id):
    # Try /api/issues/{id} first (Paperclip shortcut route)
    issue = api("GET", f"/issues/{issue_id}")
    if 'error' in issue:
        # Fallback to company-scoped route
        issue = api("GET", f"/companies/{COMPANY}/issues/{issue_id}")
    if 'error' in issue:
        print(f"Error: {issue['error']}")
        return
    print(json.dumps(issue, indent=2))

def update_issue(issue_id, status):
    valid = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled']
    if status not in valid:
        print(f"Invalid status. Use: {', '.join(valid)}")
        return
    result = api("PUT", f"/issues/{issue_id}", {"status": status})
    if 'error' in result:
        print(f"Error: {result['error']}")
    else:
        print(f"Updated {issue_id} -> {status}")

def message_agent(agent_name, msg):
    agent = get_agent_by_name(agent_name)
    if not agent:
        print(f"Agent '{agent_name}' not found")
        return
    # Add comment to agent's most recent issue
    issues = api("GET", f"/companies/{COMPANY}/issues")
    if not isinstance(issues, list):
        print(f"Error fetching issues: {issues}")
        return
    agent_issues = [i for i in issues if isinstance(i, dict) and i.get('assigneeAgentId') == agent['id']]
    if not agent_issues:
        print(f"No active issues for {agent_name}. Creating one...")
        issue = assign(agent_name, msg)
        return
    latest = sorted(agent_issues, key=lambda x: x.get('updatedAt', ''), reverse=True)[0]
    comment = api("POST", f"/companies/{COMPANY}/issues/{latest['id']}/comments", {
        "content": f"[Hermes] {msg}"
    })
    print(f"Messaged {agent_name} on issue {latest['id']}")

def poll_issue(issue_id, interval=10, timeout=3600):
    start = time.time()
    print(f"Polling issue {issue_id}...")
    while time.time() - start < timeout:
        issue = api("GET", f"/issues/{issue_id}")
        if 'error' in issue:
            issue = api("GET", f"/companies/{COMPANY}/issues/{issue_id}")
        if 'error' in issue:
            print(f"Error: {issue['error']}")
            return None
        status = issue.get('status', 'unknown')
        print(f"  [{time.strftime('%H:%M:%S')}] Status: {status}")
        if status in ['done', 'cancelled', 'blocked']:
            print(f"\nFinal result:\n{issue.get('description', 'No description')}")
            return issue
        time.sleep(interval)
    print("Timeout reached")
    return None

def run_task(agent_name, task, title=None):
    issue = assign(agent_name, task, title)
    if not issue:
        return
    return poll_issue(issue['id'])

def broadcast(task):
    issue = api("POST", f"/companies/{COMPANY}/issues", {
        "title": task[:80],
        "description": task,
        "status": "todo"
    })
    if 'error' in issue:
        print(f"Error: {issue['error']}")
    else:
        print(f"Broadcast issue {issue['id']} created. Team can self-assign.")

def team_status():
    agents = get_agents()
    issues = api("GET", f"/companies/{COMPANY}/issues")
    if not isinstance(issues, list):
        print(f"Error fetching issues: {issues}")
        return
    active_issues = [i for i in issues if isinstance(i, dict) and i.get('status') not in ['done', 'cancelled']]
    print(f"Team: OpenScanAi")
    print(f"Agents: {len(agents)} | Active Issues: {len(active_issues)}")
    print(f"\nAgent Health:")
    for a in agents:
        if not isinstance(a, dict):
            continue
        status_icon = "✅" if a.get('status') == 'idle' else "🟡" if a.get('status') == 'active' else "🔴"
        agent_issues = [i for i in active_issues if isinstance(i, dict) and i.get('assigneeAgentId') == a.get('id')]
        print(f"  {status_icon} {a.get('name','?'):<25} {a.get('status','?'):<10} ({len(agent_issues)} active issues)")

# ---------------------------------------------------------------------------
# Preview / Dev Server functionality
# ---------------------------------------------------------------------------

def find_free_port(start_port=8000, max_port=9000):
    """Find a free port starting from start_port."""
    for port in range(start_port, max_port + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    return None

def detect_project_type(project_path):
    """Detect the type of project based on files present."""
    if not os.path.isdir(project_path):
        return None
    
    # Check for package.json first
    package_json_path = os.path.join(project_path, "package.json")
    has_package_json = os.path.exists(package_json_path)
    
    # Check each project type
    for proj_type, config in PROJECT_TYPES.items():
        # Check specific config files
        for file in config["files"]:
            if os.path.exists(os.path.join(project_path, file)):
                return proj_type
        
        # For react-scripts, check package.json scripts
        if proj_type == "react-scripts" and has_package_json:
            try:
                with open(package_json_path, 'r') as f:
                    pkg = json.load(f)
                scripts = pkg.get("scripts", {})
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "react-scripts" in deps or "start" in scripts:
                    # Distinguish from Next.js/Vite which also have react
                    if "next" not in deps and "vite" not in deps:
                        return "react-scripts"
            except:
                pass
    
    # Check for static HTML
    if os.path.exists(os.path.join(project_path, "index.html")):
        return "static"
    
    # Check for package.json with dev script as fallback
    if has_package_json:
        try:
            with open(package_json_path, 'r') as f:
                pkg = json.load(f)
            scripts = pkg.get("scripts", {})
            if "dev" in scripts:
                # Try to infer from dependencies
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "vite" in deps:
                    return "vite"
                if "next" in deps:
                    return "nextjs"
                return "vite"  # Generic fallback
            if "start" in scripts:
                return "react-scripts"
        except:
            pass
    
    return None

def get_dev_command(project_type, project_path, preferred_port=None):
    """Get the appropriate dev command for the project type."""
    config = PROJECT_TYPES.get(project_type)
    if not config:
        return None, None
    
    # Check which package manager is available
    package_json_path = os.path.join(project_path, "package.json")
    has_npm = os.path.exists(os.path.join(project_path, "package-lock.json"))
    has_pnpm = os.path.exists(os.path.join(project_path, "pnpm-lock.yaml"))
    has_yarn = os.path.exists(os.path.join(project_path, "yarn.lock"))
    
    # Determine package manager
    if has_pnpm:
        pm = "pnpm"
    elif has_yarn:
        pm = "yarn"
    else:
        pm = "npm"
    
    # Build command
    if project_type == "vite":
        port = preferred_port or config["default_port"]
        if pm == "npm":
            return f"npm run dev -- --port {port}", port
        else:
            return f"{pm} dev --port {port}", port
    elif project_type == "nextjs":
        port = preferred_port or config["default_port"]
        if pm == "npm":
            return f"npm run dev -- --port {port}", port
        else:
            return f"{pm} dev --port {port}", port
    elif project_type == "tauri":
        port = preferred_port or config["default_port"]
        # Tauri uses its own port config, but we can try
        return f"{pm} tauri dev", port
    elif project_type == "react-scripts":
        port = preferred_port or config["default_port"]
        if pm == "npm":
            return f"PORT={port} npm start", port
        else:
            return f"PORT={port} {pm} start", port
    elif project_type == "static":
        port = preferred_port or config["default_port"]
        return f"python3 -m http.server {port}", port
    
    return None, None

def start_dev_server(project_path, project_type=None, preferred_port=None):
    """Start a dev server for the project and return the URL."""
    if not project_type:
        project_type = detect_project_type(project_path)
    
    if not project_type:
        print(f"Could not detect project type in {project_path}")
        return None
    
    print(f"Detected project type: {project_type}")
    
    # Find a free port
    port = preferred_port or find_free_port(PROJECT_TYPES[project_type]["default_port"])
    if not port:
        print("Could not find a free port")
        return None
    
    # Check if port is already in use
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(('127.0.0.1', port)) == 0:
            print(f"Port {port} is already in use. Trying to find another...")
            port = find_free_port(port + 1)
            if not port:
                print("Could not find a free port")
                return None
    
    command, actual_port = get_dev_command(project_type, project_path, port)
    if not command:
        print(f"Could not determine dev command for {project_type}")
        return None
    
    print(f"Starting dev server: {command}")
    print(f"Working directory: {project_path}")
    
    # Start the server in background
    try:
        process = subprocess.Popen(
            command,
            shell=True,
            cwd=project_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Wait a bit for server to start
        time.sleep(3)
        
        # Check if process is still running
        if process.poll() is not None:
            stdout, stderr = process.communicate()
            print(f"Server failed to start:")
            if stderr:
                print(stderr)
            if stdout:
                print(stdout)
            return None
        
        # Try to connect to verify it's running
        max_retries = 10
        for i in range(max_retries):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(2)
                    s.connect(('127.0.0.1', actual_port))
                    url = f"http://localhost:{actual_port}"
                    print(f"✅ Server is running at {url}")
                    return {
                        "url": url,
                        "port": actual_port,
                        "process": process,
                        "project_type": project_type,
                        "project_path": project_path
                    }
            except:
                time.sleep(1)
        
        print("Server started but could not verify it's responding")
        url = f"http://localhost:{actual_port}"
        return {
            "url": url,
            "port": actual_port,
            "process": process,
            "project_type": project_type,
            "project_path": project_path
        }
        
    except Exception as e:
        print(f"Error starting server: {e}")
        return None

def preview_issue(issue_id):
    """Get the workspace for an issue, detect project type, and start dev server."""
    # Get issue details
    issue = api("GET", f"/issues/{issue_id}")
    if 'error' in issue:
        issue = api("GET", f"/companies/{COMPANY}/issues/{issue_id}")
    if 'error' in issue:
        print(f"Error fetching issue: {issue['error']}")
        return None
    
    # Get execution workspace
    workspace_id = issue.get('executionWorkspaceId')
    if not workspace_id:
        print(f"Issue {issue_id} has no execution workspace")
        return None
    
    workspace = api("GET", f"/execution-workspaces/{workspace_id}")
    if 'error' in workspace:
        print(f"Error fetching workspace: {workspace['error']}")
        return None
    
    cwd = workspace.get('cwd')
    if not cwd or not os.path.isdir(cwd):
        print(f"Workspace CWD not found: {cwd}")
        return None
    
    print(f"Workspace path: {cwd}")
    
    # Detect and start
    result = start_dev_server(cwd)
    if result:
        # Add a comment to the issue with the preview URL
        comment_text = f"🚀 **Preview URL**: {result['url']}\n\nProject type: {result['project_type']}\nStarted at: {time.strftime('%Y-%m-%d %H:%M:%S')}"
        comment = api("POST", f"/companies/{COMPANY}/issues/{issue_id}/comments", {
            "content": comment_text
        })
        if 'error' not in comment:
            print(f"Added preview URL to issue {issue_id}")
    
    return result

def serve_project(project_path):
    """Start a dev server for a local project path."""
    if not os.path.isdir(project_path):
        print(f"Path not found: {project_path}")
        return None
    
    result = start_dev_server(project_path)
    if result:
        print(f"\nPreview URL: {result['url']}")
        print(f"Project: {result['project_path']}")
        print(f"Type: {result['project_type']}")
        print(f"PID: {result['process'].pid}")
        print("\nPress Ctrl+C to stop the server")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nStopping server...")
            result['process'].terminate()
            result['process'].wait(timeout=5)
            print("Server stopped")
    return result

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "list-agents":
        list_agents()
    elif cmd == "agent-status" and len(sys.argv) >= 3:
        agent_status(sys.argv[2])
    elif cmd == "assign" and len(sys.argv) >= 4:
        assign(sys.argv[2], " ".join(sys.argv[3:]))
    elif cmd == "issues":
        status = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == "--status" else None
        list_issues(status)
    elif cmd == "issue-status" and len(sys.argv) >= 3:
        issue_status(sys.argv[2])
    elif cmd == "update-issue" and len(sys.argv) >= 4:
        update_issue(sys.argv[2], sys.argv[3])
    elif cmd == "message" and len(sys.argv) >= 4:
        message_agent(sys.argv[2], " ".join(sys.argv[3:]))
    elif cmd == "poll" and len(sys.argv) >= 3:
        poll_issue(sys.argv[2])
    elif cmd == "run" and len(sys.argv) >= 4:
        run_task(sys.argv[2], " ".join(sys.argv[3:]))
    elif cmd == "broadcast" and len(sys.argv) >= 3:
        broadcast(" ".join(sys.argv[2:]))
    elif cmd == "team-status":
        team_status()
    elif cmd == "preview" and len(sys.argv) >= 3:
        preview_issue(sys.argv[2])
    elif cmd == "serve" and len(sys.argv) >= 3:
        serve_project(sys.argv[2])
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
