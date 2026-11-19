/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');

let content = fs.readFileSync('apps/web/src/components/inventory/ProjectStockPositionView.tsx', 'utf8');

// 1. Add wipeConfirmText state
content = content.replace(
  /const \[showClearModal, setShowClearModal\] = useState\(false\);\s*const \[clearing, setClearing\] = useState\(false\);/,
  "const [showClearModal, setShowClearModal] = useState(false);\n  const [clearing, setClearing] = useState(false);\n  const [wipeConfirmText, setWipeConfirmText] = useState('');"
);

// 2. Change {canDelete && ( ... Wipe Test Data ... )} to {user?.role === 'super_admin' && ( ... Wipe Test Data ... )}
content = content.replace(
  /\{canDelete && \(\s*<button\s*onClick=\{\(\) => setShowClearModal\(true\)\}\s*className="btn bg-red-500\/15[^>]+>\s*<Trash2 size=\{13\} \/> Wipe Test Data\s*<\/button>\s*\)\}/,
  "{user?.role === 'super_admin' && (\n            <button\n              onClick={() => { setShowClearModal(true); setWipeConfirmText(''); }}\n              className=\"btn bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-crm-coral text-xs gap-1.5\"\n              title=\"Wipe ALL inventory data (requires confirmation)\"\n            >\n              <Trash2 size={13} /> Wipe Database\n            </button>\n          )}"
);

// 3. Add input field to the modal and update button disabled state
content = content.replace(
  /<div className="flex justify-end gap-2\.5 pt-2">/,
  `<div className="mt-4">
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Type <strong>WIPE</strong> below to confirm destruction of all inventory records:
                  </label>
                  <input 
                    type="text" 
                    value={wipeConfirmText} 
                    onChange={(e) => setWipeConfirmText(e.target.value)} 
                    placeholder="WIPE" 
                    className="input text-sm w-full font-bold text-red-400 bg-[#141722] border-red-500/40 focus:border-red-500" 
                  />
                </div>
                <div className="flex justify-end gap-2.5 pt-2">`
);

content = content.replace(
  /<button\s*type="button"\s*disabled=\{clearing\}\s*onClick=\{async \(\) => \{\s*setClearing\(true\);/,
  `<button
                    type="button"
                    disabled={clearing || wipeConfirmText !== 'WIPE'}
                    onClick={async () => {
                      setClearing(true);`
);

fs.writeFileSync('apps/web/src/components/inventory/ProjectStockPositionView.tsx', content);
