(async () => {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  document.querySelector('nav [data-tab="usage"]').click(); await wait(800);
  const select=document.querySelector('[aria-label="Time span"]');
  const amount=()=>Number(document.querySelector('.usage-period-total').firstChild.textContent.replace(/[$,]/g,''));
  const allTotal=amount();
  for (const value of ['week','month','year','all']) {
    select.value=value; select.dispatchEvent(new Event('change',{bubbles:true})); await wait(350);
    if (!document.querySelector('.u-chart')) throw Error('Chart disappeared');
    if (value==='week' && amount()>=allTotal) throw Error('Week filter did not reduce dated costs');
    if (document.querySelectorAll('.provider-share').length!==2) throw Error('Provider shares missing');
  }
  const chart=document.querySelector('.u-chart');
  for (const mode of ['weekly','cumulative','daily']) {
    chart.querySelector(`[data-v="${mode}"]`).click(); await wait(400);
    if (!chart.querySelector('h3').textContent.includes(mode)) throw Error('Heading mismatch');
    if (chart.querySelectorAll('[aria-selected="true"]').length!==1 || chart.querySelector('.u-range-pill')) throw Error('Duplicate selection');
  }
  chart.scrollIntoView({block:'center'});
  return {passed:true,spans:4,modes:3};
})()
