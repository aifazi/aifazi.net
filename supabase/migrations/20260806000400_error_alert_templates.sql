-- 026_error_alert_templates.sql
-- Seed the error alert + digest email templates so they're editable in the
-- Mail Templates admin panel. Idempotent — never overwrites custom versions.

INSERT INTO mail_templates (name, purpose, subject, html, variables, active) VALUES
('Error Alert', 'error_alert',
 '[{{site_name}}] ⚠ {{error_type}} — {{message}}',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#ff4757;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#ff4757;margin:0 0 12px">🚨 Error Captured</h2>
     <p style="color:#94a3b8;line-height:1.7">A new error was captured from <strong>{{source}}</strong>.</p>
     <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin:16px 0">
       <div style="color:#8b949e;font-size:11px;letter-spacing:2px;margin-bottom:6px">TYPE</div>
       <div style="font-size:15px;font-weight:700;color:#ff4757;margin-bottom:10px">{{error_type}}</div>
       <div style="color:#8b949e;font-size:11px;letter-spacing:2px;margin-bottom:4px">MESSAGE</div>
       <div style="font-size:13px;color:#e5e7eb;margin-bottom:10px">{{message}}</div>
       <div style="color:#8b949e;font-size:11px;letter-spacing:2px;margin-bottom:4px">LOCATION</div>
       <div style="font-size:12px;color:#8b949e">{{source}} · {{endpoint}}</div>
     </div>
   </div>
   <div style="padding:16px 28px;background:#161b22;border-top:1px solid #30363d;text-align:center">
     <span style="color:#8b949e;font-size:11px">Automated alert from {{site_name}} monitoring.</span>
   </div>
 </div>',
 '["error_type","message","source","endpoint","site_name"]',
 true)
ON CONFLICT (purpose) DO NOTHING;

INSERT INTO mail_templates (name, purpose, subject, html, variables, active) VALUES
('Error Digest', 'error_digest',
 '[{{site_name}}] Error digest — {{error_count}} in the last 24h',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#f59e0b;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#f59e0b;margin:0 0 12px">📋 Error Digest</h2>
     <p style="color:#94a3b8;line-height:1.7">{{error_count}} error(s) captured in the last 24 hours.</p>
     {{errors_html}}
   </div>
   <div style="padding:16px 28px;background:#161b22;border-top:1px solid #30363d;text-align:center">
     <span style="color:#8b949e;font-size:11px">Automated digest from {{site_name}} monitoring.</span>
   </div>
 </div>',
 '["error_count","errors_html","site_name"]',
 true)
ON CONFLICT (purpose) DO NOTHING;
