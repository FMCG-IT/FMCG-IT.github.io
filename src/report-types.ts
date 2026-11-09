export type ReportSummary={
 total:number;new_count:number;progress_count:number;closed_count:number;
 average_response_hours:number|null;response_samples:number;average_closing_hours:number|null;closing_samples:number;
 unknown_creators:number;legacy_tickets:number;
};
export type OfficerReport={
 id:string;name:string;email:string;designation:string;section:string;archived:boolean;
 created_count:number;worked_count:number;assigned_count:number;closed_count:number;
 average_response_hours:number|null;response_samples:number;average_closing_hours:number|null;closing_samples:number;work_share_percent:number|null;
};
export type TicketReport={
 office?:string|null;id:string;ticket_number:number;title:string;created:string;creator_name:string|null;created_by:string|null;
 section:string;assignee_name:string|null;assignee:string;employee:string;department:string;category:string;priority:string;status:string;
 first_response_at:string|null;first_response_name:string|null;response_hours:number|null;closed_at:string|null;closed_by_name:string|null;closing_hours:number|null;
 metrics_complete:boolean;worked_by:string;
};
export type TicketReportData={
 from:string|null;to:string|null;generated_at:string;tracking_started_at:string;
 summary:ReportSummary;officers:OfficerReport[];tickets:TicketReport[];
};
