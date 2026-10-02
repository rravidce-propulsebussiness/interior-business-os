import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
let active=0;
export interface PdfOptions { brochure?:boolean; title?:string; author?:string; subject?:string }
/** One bounded, offline Chromium renderer for commercial documents and brochures. */
export async function renderPdf(html:string,options:PdfOptions={}) {
 if(active>=2)throw new Error('PDF renderer is busy');if(Buffer.byteLength(html)>80000000)throw new Error('Document exceeds rendering limit');active++;
 try {const browser=await chromium.launch({headless:true});const deadline=setTimeout(()=>{void browser.close().catch(()=>undefined);},30000);
 try {const context=await browser.newContext({javaScriptEnabled:false});await context.route('**/*',route=>route.abort());const page=await context.newPage();page.setDefaultTimeout(15000);await page.setContent(html,{waitUntil:'load',timeout:15000});
 if(options.brochure){await page.emulateMedia({media:'print'});const problems=await page.evaluate(()=>{
  const issues:string[]=[];for(const item of document.querySelectorAll<HTMLElement>('[data-component]')){if(item.scrollHeight>item.clientHeight+2||item.scrollWidth>item.clientWidth+2)issues.push(item.dataset.label??'Component');for(const img of item.querySelectorAll('img'))if(!img.complete||img.naturalWidth===0)issues.push('Missing image');}
  return issues.slice(0,15);
 });if(problems.length)throw new Error(`Print preflight: resize or shorten overflowing content: ${problems.join(', ')}`);}
 const bytes=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:!options.brochure,headerTemplate:'<span></span>',footerTemplate:'<div style="width:100%;text-align:center;font-size:9px;color:#666"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
 if(!options.brochure)return bytes;
 const pdf=await PDFDocument.load(bytes);pdf.setTitle(options.title??'Brochure');pdf.setAuthor(options.author??'');pdf.setSubject(options.subject??'Business brochure');pdf.setCreator('Business OS');pdf.setProducer('Business OS document renderer');return Buffer.from(await pdf.save());
 }finally{clearTimeout(deadline);await browser.close();}
 }finally{active--;}
}
