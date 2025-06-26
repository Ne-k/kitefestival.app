'use client'

import { useState, useRef } from "react";
import fetch from '../../util/fetch';
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import H1 from "../../components/ui/H1";
import H2 from "../../components/ui/H2";
import TextInput from "../../components/ui/TextInput";
import { usePrompt } from "../../components/ui/Prompt";
import { useAlert } from "../../components/ui/Alert";

const usePasscode = () => {
  const [enabled, setEnabled] = useState(false);
  const [passcode, setPasscodeValue] = useState('');

  return {
    enabled,
    passcode,
    toggle: () => setEnabled(!enabled),
    setPasscode: (value) => { 
      setPasscodeValue(value);
      if (value) {
        setEnabled(true);
      } else {
        setEnabled(false);
      }
    }
  }
}

export default function ConfigPage() {
  const { openPrompt } = usePrompt();
  const { openAlert } = useAlert();
  const fileInputRef = useRef(null);
  const { 
     enabled: useAdminPasscode,
     passcode: adminPasscode,
     toggle: toggleAdminPasscode,
     setPasscode: setAdminPasscode
  } = usePasscode();
  const { 
    enabled: useEditorPasscode,
    passcode: editorPasscode,
    toggle: toggleEditorPasscode,
    setPasscode: setEditorPasscode
  } = usePasscode();
  const { 
    enabled: useUserPasscode,
    passcode: userPasscode,
    toggle: toggleUserPasscode,
    setPasscode: setUserPasscode
  } = usePasscode();

  const submitPasscodes = async function() {
    if (!useAdminPasscode && !useEditorPasscode && !useUserPasscode) {
      return;
    }
    const authentication = await openPrompt("Enter the current admin passcode.", 'password').catch(() => '');
    if (!authentication) {
      return;
    }
    const payload = { authentication };
    if (useAdminPasscode) {
      payload.adminPasscode = adminPasscode;
    }
    if (useEditorPasscode) {
      payload.editorPasscode = editorPasscode;
    }
    if (useUserPasscode) {
      payload.userPasscode = userPasscode;
    }
    const response = await fetch('/api/passcodes', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    const type = response.ok ? 'success' : 'error';
    const { message } = await response.json();
    openAlert(message, type);
  }

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const formatDateTime = () => {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
           now.toTimeString().split(' ')[0].replace(/:/g, '-');
  }

  const exportData = async () => {
    const password = await openPrompt("Enter admin password to export data:", 'password').catch(() => '');
    if (!password) return;

    try {
      const response = await fetch('/api/admin/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!response.ok) {
        const error = await response.json();
        openAlert(error.error || 'Export failed', 'error');
        return;
      }

      const { exportData, sqlDump } = await response.json();
      const timestamp = formatDateTime();
      
      // Download JSON export
      downloadFile(
        JSON.stringify(exportData, null, 2), 
        `kitefestival-export-${timestamp}.json`, 
        'application/json'
      );
      
      // Download SQL dump
      downloadFile(
        sqlDump, 
        `kitefestival-dump-${timestamp}.sql`, 
        'text/sql'
      );

      openAlert(`Export completed! Downloaded ${exportData.totalActivities} activities and ${exportData.totalComments} comments.`, 'success');
    } catch (error) {
      openAlert('Export failed: ' + error.message, 'error');
    }
  }

  const importData = async () => {
    const password = await openPrompt("Enter admin password to import data:", 'password').catch(() => '');
    if (!password) return;

    if (!fileInputRef.current?.files?.[0]) {
      openAlert('Please select a JSON file to import', 'error');
      return;
    }

    const file = fileInputRef.current.files[0];
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const importData = JSON.parse(e.target.result);
        
        const clearExisting = await openPrompt("Clear existing data before import? (y/n):", 'text').catch(() => '');
        const shouldClear = clearExisting?.toLowerCase() === 'y' || clearExisting?.toLowerCase() === 'yes';

        const response = await fetch('/api/admin/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            password, 
            importData, 
            clearExisting: shouldClear 
          })
        });

        if (!response.ok) {
          const error = await response.json();
          openAlert(error.error || 'Import failed', 'error');
          return;
        }

        const result = await response.json();
        openAlert(`Import completed! Imported ${result.imported.activities} activities and ${result.imported.comments} comments.`, 'success');
        
        // Reset file input
        fileInputRef.current.value = '';
      } catch (error) {
        openAlert('Import failed: Invalid JSON file or ' + error.message, 'error');
      }
    };

    reader.readAsText(file);
  }

  const wipeDatabase = async () => {
    const password = await openPrompt("Enter admin password to wipe database:", 'password').catch(() => '');
    if (!password) return;

    const confirm1 = await openPrompt("⚠️ WARNING: This will DELETE ALL DATA! Type 'WIPE' to confirm:", 'text').catch(() => '');
    if (confirm1 !== 'WIPE') return;

    const confirm2 = await openPrompt("Are you absolutely sure? This cannot be undone! Type 'YES DELETE EVERYTHING':", 'text').catch(() => '');
    if (confirm2 !== 'YES DELETE EVERYTHING') return;

    try {
      const response = await fetch('/api/admin/wipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!response.ok) {
        const error = await response.json();
        openAlert(error.error || 'Wipe failed', 'error');
        return;
      }

      const result = await response.json();
      const timestamp = formatDateTime();
      
      // Download backup before confirming wipe
      downloadFile(
        JSON.stringify(result.snapshot, null, 2), 
        `kitefestival-backup-before-wipe-${timestamp}.json`, 
        'application/json'
      );
      
      downloadFile(
        result.sqlDump, 
        `kitefestival-backup-before-wipe-${timestamp}.sql`, 
        'text/sql'
      );

      openAlert(`🗑️ Database wiped! Deleted ${result.wiped.activities} activities and ${result.wiped.comments} comments. Backup downloaded.`, 'success');
    } catch (error) {
      openAlert('Wipe failed: ' + error.message, 'error');
    }
  }

  return (
    <div>
      <H1>Config</H1>
      
      {/* Passcode Configuration */}
      <form onSubmit={e => { e.preventDefault(); submitPasscodes()}}>
        <Panel>
          <H2>Set Passcodes</H2>
          <Panel>
            <label htmlFor="admin-passcode">Admin</label>&nbsp;
            <input type="checkbox" checked={useAdminPasscode} onChange={toggleAdminPasscode} />
            <TextInput id="admin-passcode" value={adminPasscode} onChange={e => setAdminPasscode(e.target.value)} />
          </Panel>
          <Panel>
            <label htmlFor="editor-passcode">Editor</label>&nbsp;
            <input type="checkbox" checked={useEditorPasscode} onChange={toggleEditorPasscode} />
            <TextInput id="editor-passcode" value={editorPasscode} onChange={e => setEditorPasscode(e.target.value)} />
          </Panel>
          <Panel>
            <label htmlFor="user-passcode">User</label>&nbsp;
            <input type="checkbox" checked={useUserPasscode} onChange={toggleUserPasscode} />
            <TextInput id="user-passcode" value={userPasscode} onChange={e => setUserPasscode(e.target.value)} />
          </Panel>
        </Panel>
        <Button type="submit">Update Passcodes</Button>
      </form>

      {/* Admin Panel */}
      <Panel style={{ marginTop: '32px', borderLeft: '4px solid #ff6b6b' }}>
        <H2 style={{ color: '#d63031' }}>🔧 Admin Panel</H2>
        <p style={{ marginBottom: '16px', color: '#636e72' }}>
          Dangerous operations that require admin password verification.
        </p>
        
        {/* Export Section */}
        <Panel style={{ marginBottom: '16px' }}>
          <H2 style={{ fontSize: '18px' }}>📤 Export Data</H2>
          <p style={{ marginBottom: '12px', fontSize: '14px' }}>
            Download a complete backup of all activities and comments (JSON + SQL formats).
          </p>
          <Button onClick={exportData} style={{ backgroundColor: '#0984e3' }}>
            Export Database
          </Button>
        </Panel>

        {/* Import Section */}
        <Panel style={{ marginBottom: '16px' }}>
          <H2 style={{ fontSize: '18px' }}>📥 Import Data</H2>
          <p style={{ marginBottom: '12px', fontSize: '14px' }}>
            Import activities and comments from a JSON export file.
          </p>
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".json"
            style={{ marginBottom: '12px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
          <br />
          <Button onClick={importData} style={{ backgroundColor: '#00b894' }}>
            Import from File
          </Button>
        </Panel>

        {/* Wipe Section */}
        <Panel style={{ 
          border: '2px solid #d63031', 
          backgroundColor: '#ffeaea', 
          marginBottom: '16px' 
        }}>
          <H2 style={{ fontSize: '18px', color: '#d63031' }}>🗑️ Nuclear Option</H2>
          <p style={{ marginBottom: '12px', fontSize: '14px', color: '#2d3436' }}>
            <strong>⚠️ DANGER:</strong> This will permanently delete ALL activities and comments. 
            A backup will be automatically downloaded before wiping.
          </p>
          <Button 
            onClick={wipeDatabase} 
            style={{ 
              backgroundColor: '#d63031', 
              border: '2px solid #a71e1e',
              fontWeight: 'bold'
            }}
          >
            🚨 WIPE ACTIVITIES 🚨
          </Button>
        </Panel>
      </Panel>
    </div>
  );
}
