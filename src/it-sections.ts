export const sections=['Infrastructure','Software/System','SAP'] as const;
export type ITSection=(typeof sections)[number];
export function sectionFor(specialty:string):ITSection{
 const role=specialty.trim().toLowerCase();
 if(['infrastructure','network','hardware'].includes(role))return 'Infrastructure';
 if(role==='sap')return 'SAP';
 return 'Software/System';
}
export const sectionSlug=(section:ITSection)=>section==='Software/System'?'software-system':section.toLowerCase();
