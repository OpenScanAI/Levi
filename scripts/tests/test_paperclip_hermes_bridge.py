#!/usr/bin/env python3
"""
Tests for paperclip-hermes-bridge.py
Run with: python3 -m pytest scripts/tests/test_paperclip_hermes_bridge.py -v
"""
import sys
import os
import json
import tempfile
import socket
from pathlib import Path
from unittest.mock import patch, MagicMock, mock_open

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import with proper module name
import importlib.util
spec = importlib.util.spec_from_file_location(
    "paperclip_hermes_bridge", 
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "paperclip-hermes-bridge.py")
)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class TestFindFreePort:
    """Tests for find_free_port function."""

    def test_finds_free_port(self):
        """Should find a free port in the given range."""
        port = bridge.find_free_port(start_port=18000, max_port=18010)
        assert port is not None
        assert 18000 <= port <= 18010

    def test_port_is_actually_free(self):
        """Found port should be bindable."""
        port = bridge.find_free_port(start_port=18000, max_port=18010)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('127.0.0.1', port))

    def test_returns_none_when_no_ports_available(self):
        """Should return None when all ports in range are taken."""
        # Bind all ports in a small range
        sockets = []
        try:
            for p in range(19000, 19005):
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.bind(('127.0.0.1', p))
                sockets.append(s)
            
            result = bridge.find_free_port(start_port=19000, max_port=19004)
            assert result is None
        finally:
            for s in sockets:
                s.close()


class TestDetectProjectType:
    """Tests for detect_project_type function."""

    def test_detects_vite(self, tmp_path):
        """Should detect Vite project from vite.config.ts."""
        (tmp_path / "vite.config.ts").write_text("export default {}")
        assert bridge.detect_project_type(str(tmp_path)) == "vite"

    def test_detects_vite_js(self, tmp_path):
        """Should detect Vite project from vite.config.js."""
        (tmp_path / "vite.config.js").write_text("export default {}")
        assert bridge.detect_project_type(str(tmp_path)) == "vite"

    def test_detects_nextjs(self, tmp_path):
        """Should detect Next.js project from next.config.js."""
        (tmp_path / "next.config.js").write_text("module.exports = {}")
        assert bridge.detect_project_type(str(tmp_path)) == "nextjs"

    def test_detects_tauri(self, tmp_path):
        """Should detect Tauri project from tauri.conf.json."""
        (tmp_path / "src-tauri").mkdir()
        (tmp_path / "src-tauri" / "tauri.conf.json").write_text("{}")
        assert bridge.detect_project_type(str(tmp_path)) == "tauri"

    def test_detects_static_html(self, tmp_path):
        """Should detect static project from index.html."""
        (tmp_path / "index.html").write_text("<html></html>")
        assert bridge.detect_project_type(str(tmp_path)) == "static"

    def test_detects_react_scripts(self, tmp_path):
        """Should detect Create React App from package.json with react-scripts."""
        pkg = {
            "dependencies": {"react-scripts": "5.0.1"},
            "scripts": {"start": "react-scripts start"}
        }
        (tmp_path / "package.json").write_text(json.dumps(pkg))
        assert bridge.detect_project_type(str(tmp_path)) == "react-scripts"

    def test_detects_vite_from_deps(self, tmp_path):
        """Should detect Vite from package.json devDependencies."""
        pkg = {
            "devDependencies": {"vite": "^4.0.0"},
            "scripts": {"dev": "vite"}
        }
        (tmp_path / "package.json").write_text(json.dumps(pkg))
        assert bridge.detect_project_type(str(tmp_path)) == "vite"

    def test_detects_nextjs_from_deps(self, tmp_path):
        """Should detect Next.js from package.json dependencies."""
        pkg = {
            "dependencies": {"next": "^13.0.0"},
            "scripts": {"dev": "next dev"}
        }
        (tmp_path / "package.json").write_text(json.dumps(pkg))
        assert bridge.detect_project_type(str(tmp_path)) == "nextjs"

    def test_returns_none_for_unknown(self, tmp_path):
        """Should return None for unknown project types."""
        (tmp_path / "random.txt").write_text("hello")
        assert bridge.detect_project_type(str(tmp_path)) is None

    def test_returns_none_for_nonexistent_path(self):
        """Should return None for non-existent path."""
        assert bridge.detect_project_type("/nonexistent/path/12345") is None


class TestGetDevCommand:
    """Tests for get_dev_command function."""

    def test_vite_with_npm(self, tmp_path):
        """Should generate correct Vite command with npm."""
        (tmp_path / "package-lock.json").write_text("{}")
        cmd, port = bridge.get_dev_command("vite", str(tmp_path))
        assert "npm run dev" in cmd
        assert "--port" in cmd
        assert port == 5173

    def test_vite_with_pnpm(self, tmp_path):
        """Should generate correct Vite command with pnpm."""
        (tmp_path / "pnpm-lock.yaml").write_text("")
        cmd, port = bridge.get_dev_command("vite", str(tmp_path))
        assert "pnpm dev" in cmd
        assert port == 5173

    def test_nextjs_with_yarn(self, tmp_path):
        """Should generate correct Next.js command with yarn."""
        (tmp_path / "yarn.lock").write_text("")
        cmd, port = bridge.get_dev_command("nextjs", str(tmp_path))
        assert "yarn dev" in cmd
        assert port == 3000

    def test_react_scripts_port_override(self, tmp_path):
        """Should use custom port for React scripts."""
        (tmp_path / "package-lock.json").write_text("{}")
        cmd, port = bridge.get_dev_command("react-scripts", str(tmp_path), preferred_port=4000)
        assert "PORT=4000" in cmd
        assert port == 4000

    def test_static_server(self, tmp_path):
        """Should generate Python http.server command for static."""
        cmd, port = bridge.get_dev_command("static", str(tmp_path))
        assert "python3 -m http.server" in cmd
        assert port == 8000

    def test_tauri_command(self, tmp_path):
        """Should generate Tauri dev command."""
        (tmp_path / "package-lock.json").write_text("{}")
        cmd, port = bridge.get_dev_command("tauri", str(tmp_path))
        assert "tauri dev" in cmd


class TestApi:
    """Tests for api function."""

    @patch('urllib.request.urlopen')
    def test_get_request(self, mock_urlopen):
        """Should make GET request and parse JSON response."""
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"id": "123", "name": "test"}'
        mock_urlopen.return_value.__enter__.return_value = mock_response
        
        result = bridge.api("GET", "/test")
        assert result == {"id": "123", "name": "test"}

    @patch('urllib.request.urlopen')
    def test_post_request(self, mock_urlopen):
        """Should make POST request with JSON body."""
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"success": true}'
        mock_urlopen.return_value.__enter__.return_value = mock_response
        
        result = bridge.api("POST", "/test", {"key": "value"})
        assert result == {"success": True}

    @patch('urllib.request.urlopen')
    def test_http_error(self, mock_urlopen):
        """Should handle HTTP errors gracefully."""
        from urllib.error import HTTPError
        mock_urlopen.side_effect = HTTPError(
            "http://test", 404, "Not Found", {}, None
        )
        
        result = bridge.api("GET", "/test")
        assert "error" in result
        assert result["status"] == 404


class TestGetAgents:
    """Tests for get_agents function."""

    @patch.object(bridge, 'api')
    def test_returns_list(self, mock_api):
        """Should return list of agents."""
        mock_api.return_value = [
            {"id": "1", "name": "Agent1", "status": "idle"},
            {"id": "2", "name": "Agent2", "status": "active"}
        ]
        
        result = bridge.get_agents()
        assert len(result) == 2
        assert result[0]["name"] == "Agent1"

    @patch.object(bridge, 'api')
    def test_handles_error(self, mock_api):
        """Should return empty list on error."""
        mock_api.return_value = {"error": "Connection failed"}
        
        result = bridge.get_agents()
        assert result == []

    @patch.object(bridge, 'api')
    def test_handles_non_list(self, mock_api):
        """Should return empty list for non-list response."""
        mock_api.return_value = {"count": 5}
        
        result = bridge.get_agents()
        assert result == []


class TestGetAgentByName:
    """Tests for get_agent_by_name function."""

    @patch.object(bridge, 'get_agents')
    def test_exact_match(self, mock_get_agents):
        """Should find agent by exact name match."""
        mock_get_agents.return_value = [
            {"id": "1", "name": "Frontend Developer", "role": "dev"},
            {"id": "2", "name": "Backend Architect", "role": "arch"}
        ]
        
        result = bridge.get_agent_by_name("Frontend Developer")
        assert result["id"] == "1"

    @patch.object(bridge, 'get_agents')
    def test_fuzzy_match(self, mock_get_agents):
        """Should find agent by fuzzy match."""
        mock_get_agents.return_value = [
            {"id": "1", "name": "Frontend Developer", "role": "dev"}
        ]
        
        result = bridge.get_agent_by_name("frontend")
        assert result["id"] == "1"

    @patch.object(bridge, 'get_agents')
    def test_no_match(self, mock_get_agents):
        """Should return None when no match found."""
        mock_get_agents.return_value = [
            {"id": "1", "name": "Agent1", "role": "dev"}
        ]
        
        result = bridge.get_agent_by_name("nonexistent")
        assert result is None


class TestAssign:
    """Tests for assign function."""

    @patch.object(bridge, 'get_agent_by_name')
    @patch.object(bridge, 'api')
    def test_creates_issue(self, mock_api, mock_get_agent):
        """Should create issue and assign to agent."""
        mock_get_agent.return_value = {"id": "agent1", "name": "Test Agent"}
        mock_api.return_value = {"id": "issue1", "status": "todo"}
        
        result = bridge.assign("Test Agent", "Build landing page")
        assert result["id"] == "issue1"

    @patch.object(bridge, 'get_agent_by_name')
    def test_agent_not_found(self, mock_get_agent):
        """Should return None when agent not found."""
        mock_get_agent.return_value = None
        
        result = bridge.assign("Nonexistent", "Task")
        assert result is None


class TestGenerateShareableUrl:
    """Tests for generate_shareable_url function."""

    @patch.object(bridge, 'api')
    @patch.object(bridge, 'detect_project_type')
    @patch.object(bridge, 'find_free_port')
    def test_generates_urls(self, mock_find_port, mock_detect, mock_api, tmp_path):
        """Should generate both local and shareable URLs."""
        test_cwd = str(tmp_path)
        mock_api.side_effect = [
            {"id": "issue1", "executionWorkspaceId": "ws1", "title": "Test Issue", "assigneeAgentId": "agent1"},
            {"cwd": test_cwd, "id": "ws1"},
            {"id": "comment1"}
        ]
        mock_detect.return_value = "vite"
        mock_find_port.return_value = 5173
        
        with patch.dict(os.environ, {"PAPERCLIP_PUBLIC_URL": "https://test.com"}):
            result = bridge.generate_shareable_url("issue1")
        
        assert result is not None
        assert result["local_url"] == "http://localhost:5173"
        assert result["share_url"] == "https://test.com/preview/issue1"
        assert result["project_type"] == "vite"

    @patch.object(bridge, 'api')
    def test_no_workspace(self, mock_api):
        """Should return None when issue has no workspace."""
        mock_api.return_value = {"id": "issue1", "executionWorkspaceId": None}
        
        result = bridge.generate_shareable_url("issue1")
        assert result is None

    @patch.object(bridge, 'api')
    def test_issue_not_found(self, mock_api):
        """Should return None when issue not found."""
        mock_api.return_value = {"error": "Not found"}
        
        result = bridge.generate_shareable_url("nonexistent")
        assert result is None


class TestProjectTypeConfig:
    """Tests for PROJECT_TYPES configuration."""

    def test_all_types_have_required_keys(self):
        """All project types should have required configuration keys."""
        required_keys = ["files", "commands", "default_port", "url_path"]
        for proj_type, config in bridge.PROJECT_TYPES.items():
            for key in required_keys:
                assert key in config, f"{proj_type} missing {key}"

    def test_ports_are_valid(self):
        """All default ports should be in valid range."""
        for proj_type, config in bridge.PROJECT_TYPES.items():
            port = config["default_port"]
            assert 1 <= port <= 65535, f"{proj_type} has invalid port {port}"


class TestIntegration:
    """Integration-style tests."""

    def test_full_workflow_mocked(self, tmp_path):
        """Test complete workflow with mocked API."""
        # Create a fake Vite project
        (tmp_path / "vite.config.ts").write_text("export default {}")
        (tmp_path / "package.json").write_text(json.dumps({
            "scripts": {"dev": "vite"}
        }))
        
        # Detect project type
        proj_type = bridge.detect_project_type(str(tmp_path))
        assert proj_type == "vite"
        
        # Get dev command
        cmd, port = bridge.get_dev_command(proj_type, str(tmp_path))
        assert cmd is not None
        assert port == 5173


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
