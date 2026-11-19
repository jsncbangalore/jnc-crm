/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const targetFile = 'apps/web/src/pages/UsersPage.tsx';
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Add Tabs State & Import TeamsTab
if (!content.includes('TeamsTab')) {
  content = content.replace(
    "import { format } from 'date-fns';",
    "import { format } from 'date-fns';\nimport TeamsTab from './TeamsTab';"
  );
  
  content = content.replace(
    "const [statusFilter, setStatusFilter] = useState('');",
    "const [statusFilter, setStatusFilter] = useState('');\n  const [activeTab, setActiveTab] = useState<'users' | 'teams'>('users');\n  const [teams, setTeams] = useState<any[]>([]);"
  );
  
  // Replace string team with teamId
  content = content.replace(
    "team: 'Direct Sales & Integration',",
    "teamId: '',"
  );
  
  content = content.replace(
    "team: string;",
    "teamId: string;"
  );
  
  content = content.replace(
    "team: editingUser.team || '',",
    "teamId: editingUser.teamId || '',"
  );
}

// 2. Fetch Teams on mount
if (!content.includes('fetchTeams()')) {
  content = content.replace(
    "const fetchUsers = async () => {",
    "const fetchTeams = async () => { try { const { data } = await usersApi.get('/teams' as any); setTeams(data); } catch(e) {} };\n\n  const fetchUsers = async () => {"
  );
  content = content.replace(
    "fetchUsers();\n  }, [",
    "fetchUsers();\n    fetchTeams();\n  }, ["
  );
}

// 3. Tab Navigation UI
if (!content.includes('Users & Teams Setup')) {
  // Try to find the header div
  content = content.replace(
    /<div className="flex items-center justify-between mb-8">[\s\S]*?<\/button>\s*<\/div>/,
    `<div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Users & Teams Setup</h1>
        <p className="text-sm text-slate-400 mt-1">Manage system access, roles, and functional team restrictions.</p>
        
        <div className="flex items-center gap-6 mt-4 border-b border-[#2A3042]">
          <button 
            onClick={() => setActiveTab('users')} 
            className={\`pb-3 text-sm font-semibold transition-colors border-b-2 \${activeTab === 'users' ? 'border-crm-violet-light text-crm-violet-light' : 'border-transparent text-slate-400 hover:text-slate-200'}\`}
          >
            User Accounts
          </button>
          <button 
            onClick={() => setActiveTab('teams')} 
            className={\`pb-3 text-sm font-semibold transition-colors border-b-2 \${activeTab === 'teams' ? 'border-crm-violet-light text-crm-violet-light' : 'border-transparent text-slate-400 hover:text-slate-200'}\`}
          >
            Access Teams & Modules
          </button>
        </div>
      </div>
      
      {activeTab === 'users' && canManageUsers && (
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <UserPlus size={18} className="mr-2" /> Provision New User
        </button>
      )}
    </div>`
  );
}

// 4. Wrap existing table with activeTab check
if (!content.includes('activeTab === \'users\' ? (')) {
  content = content.replace(
    /\{\/\* Filters & Search \*\/\}/,
    `{activeTab === 'users' ? (
      <div className="space-y-6">
        {/* Filters & Search */}`
  );
  
  content = content.replace(
    /\{\/\*  MODAL: Create New User Form  \*\/\}/,
    `</div>
    ) : (
      <TeamsTab />
    )}
    
    {/*  MODAL: Create New User Form  */}`
  );
}

// 5. Update Create/Edit Forms for Team dropdown
content = content.replace(
  /<label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Team \/ Division<\/label>\s*<input\s*type="text"[\s\S]*?onChange=\{\(e\) => setCreateForm\(\{ \.\.\.createForm, team: e.target.value \}\)\}[\s\S]*?\/>/g,
  `<label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Access Team / Restrictions</label>
   <select
     className="input-field"
     value={createForm.teamId}
     onChange={e => setCreateForm({ ...createForm, teamId: e.target.value })}
   >
     <option value="">Unrestricted (Full Role Access)</option>
     {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
   </select>`
);

content = content.replace(
  /<label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Team \/ Division<\/label>\s*<input\s*type="text"[\s\S]*?onChange=\{\(e\) => setEditForm\(\{ \.\.\.editForm, team: e.target.value \}\)\}[\s\S]*?\/>/g,
  `<label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Access Team / Restrictions</label>
   <select
     className="input-field"
     value={editForm.teamId}
     onChange={e => setEditForm({ ...editForm, teamId: e.target.value })}
   >
     <option value="">Unrestricted (Full Role Access)</option>
     {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
   </select>`
);

content = content.replace(/user\.team/g, "user.teamRef?.name");
content = content.replace(/\{user\.teamRef\?\.name || 'Unassigned'\}/g, "{user.teamRef?.name || 'Unrestricted'}");

fs.writeFileSync(targetFile, content);
console.log('UsersPage patched');
