const xlsx = require('xlsx'); 
const fs = require('fs');
const val = xlsx.readFile('c:/gyeongmae program/2026-1학기 리그 오브 레전드 멸망전(응답).xlsx'); 
const sheet = val.Sheets[val.SheetNames[0]]; 
const rows = xlsx.utils.sheet_to_json(sheet, {header: 1});
fs.writeFileSync('c:/gyeongmae program/backend/test_headers.txt', rows[0].map((h, i) => i + ': ' + h).join('\n') + '\n\n' + rows[1].map((d, i) => i + ': ' + d).join('\n'), 'utf8');
