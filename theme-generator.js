const COLOR_KEYS=['deep','bg','card','raised','text','text2','muted','line','lineStrong','accent','codex','negative'];
function parseTheme(text) {
  const value=JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  if (!value || typeof value.name!=='string' || !value.name.trim() || value.name.length>48) throw new Error('The theme needs a short name');
  if (!['sans','mono','serif'].includes(value.font) || !['compact','comfortable'].includes(value.density)) throw new Error('The theme contains an unsupported font or spacing style');
  if (!Number.isFinite(value.radius) || value.radius<0 || value.radius>20 || !Number.isFinite(value.borderWidth) || value.borderWidth<0 || value.borderWidth>2) throw new Error('The theme contains invalid border settings');
  const colors={};
  for(const key of COLOR_KEYS) {
    if(!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value.colors?.[key])) throw new Error('The theme contains an invalid '+key+' color');
    colors[key]=value.colors[key];
  }
  const luminance=hex=>{
    const rgb=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255).map(value=>value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  for(const key of COLOR_KEYS.filter(key=>!['line','lineStrong'].includes(key))) if(colors[key].length===9 && !/ff$/i.test(colors[key])) throw new Error('Theme surfaces and text must be opaque');
  for(const surface of ['deep','bg','card','raised']) for(const foreground of ['text','text2','muted']) {
    const a=luminance(colors[surface]),b=luminance(colors[foreground]);
    if((Math.max(a,b)+.05)/(Math.min(a,b)+.05)<4.5) throw new Error('The generated theme has unreadable text contrast. Generate another theme.');
  }
  return {name:value.name.trim(),colors,font:value.font,radius:value.radius,borderWidth:value.borderWidth,density:value.density};
}
function themePrompt() {
  const concepts=['a printed engineering notebook','a phosphor terminal','a quiet midnight observatory','a warm architectural studio','a restrained ocean navigation instrument','a crisp editorial code workbench'];
  const inspiration=concepts[Math.floor(Math.random()*concepts.length)];
  return `Create one distinctive, readable theme for the Relay coding desktop app, inspired by ${inspiration}. Invent a coherent light or dark theme. Return ONLY a JSON object. Do not use tools or edit files. Required schema: {"name":"short theme name","colors":{"deep":"#hex","bg":"#hex","card":"#hex","raised":"#hex","text":"#hex","text2":"#hex","muted":"#hex","line":"#hex","lineStrong":"#hex","accent":"#hex","codex":"#hex","negative":"#hex"},"font":"sans or mono or serif","radius":0,"borderWidth":1,"density":"compact or comfortable"}. Use exactly these keys. Every color must be #RRGGBB or #RRGGBBAA. Use opaque backgrounds and text; alpha is appropriate only for line/lineStrong borders. All three text colors must remain comfortably readable on all four surfaces (aim for 4.5:1 contrast or higher). Accent identifies active work; negative identifies errors. Font controls the whole app. Radius can be 0 to 20 pixels (0 means square terminal corners), borderWidth 0 to 2 pixels. Choose spacing density deliberately. No CSS, HTML, code fences or explanations.`;
}
module.exports={parseTheme,themePrompt};
