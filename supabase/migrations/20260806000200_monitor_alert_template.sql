-- 024_monitor_alert_template.sql
-- Seed the monitor alert email template so it's editable in the Mail Templates
-- admin panel. Uses ON CONFLICT so it's idempotent and never overwrites a
-- staff-customized version.

INSERT INTO mail_templates (name, purpose, subject, html, variables, active) VALUES
('Service Down Alert', 'monitor_alert',
 '[{{site_name}}] ⚠ Service down: {{service}}',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#ff4757;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#ff4757;margin:0 0 12px">🚨 Service Down</h2>
     <p style="color:#94a3b8;line-height:1.7">A monitored service is reporting <strong style="color:#ff4757">DOWN</strong>.</p>
     <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin:16px 0">
       <div style="color:#8b949e;font-size:11px;letter-spacing:2px;margin-bottom:8px">SERVICE</div>
       <div style="font-size:16px;font-weight:700;color:#e5e7eb;margin-bottom:12px">{{service}}</div>
       <div style="color:#8b949e;font-size:11px;letter-spacing:2px;margin-bottom:4px">DETAIL</div>
       <div style="font-size:13px;color:#e5e7eb">{{detail}}</div>
       <div style="color:#8b949e;font-size:11px;letter-spacing:2px;margin:12px 0 4px">CHECKED AT</div>
       <div style="font-size:12px;color:#8b949e">{{checked_at}}</div>
     </div>
     <div style="text-align:center;margin:24px 0 8px">
       <a href="{{status_url}}" style="display:inline-block;background:#ff4757;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:1.5px;text-decoration:none;padding:14px 34px;border-radius:8px">CHECK STATUS PAGE</a>
     </div>
   </div>
   <div style="padding:16px 28px;background:#161b22;border-top:1px solid #30363d;text-align:center">
     <span style="color:#8b949e;font-size:11px">Automated alert from {{site_name}} monitoring.</span>
   </div>
 </div>',
 '["service","detail","checked_at","status_url","site_name"]',
 true)
ON CONFLICT (purpose) DO NOTHING;
