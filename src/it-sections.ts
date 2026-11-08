export const sections=['Infrastructure','Software','System'] as const;
export type ITSection=(typeof sections)[number];
export function sectionFor(specialty:string):ITSection{
 const role=specialty.trim().toLowerCase();
 if(['infrastructure','network','hardware'].includes(role))return 'Infrastructure';
 if(role==='software')return 'Software';
 return 'System';
}
