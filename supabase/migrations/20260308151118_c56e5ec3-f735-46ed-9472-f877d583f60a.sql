
-- Performance indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_client_timelines_organization_id ON public.client_timelines(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_timelines_status ON public.client_timelines(status);
CREATE INDEX IF NOT EXISTS idx_client_timelines_is_active ON public.client_timelines(is_active);
CREATE INDEX IF NOT EXISTS idx_client_timelines_client_id ON public.client_timelines(client_id);
CREATE INDEX IF NOT EXISTS idx_client_timelines_org_status ON public.client_timelines(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_client_timelines_org_active ON public.client_timelines(organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_client_boletos_timeline_id ON public.client_boletos(timeline_id);
CREATE INDEX IF NOT EXISTS idx_client_boletos_status ON public.client_boletos(status);
CREATE INDEX IF NOT EXISTS idx_client_boletos_due_date ON public.client_boletos(due_date);

CREATE INDEX IF NOT EXISTS idx_timeline_lines_timeline_id ON public.timeline_lines(timeline_id);

CREATE INDEX IF NOT EXISTS idx_timeline_events_line_id ON public.timeline_events(line_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_status ON public.timeline_events(status);
CREATE INDEX IF NOT EXISTS idx_timeline_events_event_date ON public.timeline_events(event_date);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_organization_id ON public.user_roles(organization_id);

CREATE INDEX IF NOT EXISTS idx_collection_actions_org_id ON public.collection_actions(organization_id);
CREATE INDEX IF NOT EXISTS idx_collection_actions_timeline_id ON public.collection_actions(timeline_id);

CREATE INDEX IF NOT EXISTS idx_client_agreements_org_id ON public.client_agreements(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_agreements_timeline_id ON public.client_agreements(timeline_id);
