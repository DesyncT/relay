(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));const assert=(v,m)=>{if(!v)throw Error(m)};
 const body=document.querySelector('#log .msg .body'),style=getComputedStyle(body);
 assert(style.borderTopWidth==='0px','Message border remains');assert(style.padding==='0px','Message padding remains');assert(style.boxShadow==='none','Message shadow remains');assert(style.backgroundColor==='rgba(0, 0, 0, 0)','Message background remains');
 const log=document.querySelector('#log');log.scrollTop=0;await wait(80);const button=document.querySelector('#scrollBottom');assert(button,'Scroll button missing');assert(!button.querySelector('.sb-ring,.sb-orb'),'Decorative ring remains');assert(button.querySelectorAll('svg').length===1,'More than one icon');assert(getComputedStyle(button).boxShadow==='none','Button shadow remains');
 button.click();await wait(700);assert(log.scrollHeight-log.clientHeight-log.scrollTop<40,'Scroll button did not reach latest');
 log.scrollTop=0;await wait(100);return {passed:true,border:style.borderTopWidth,padding:style.padding,scrollButton:'plain'};
})()
