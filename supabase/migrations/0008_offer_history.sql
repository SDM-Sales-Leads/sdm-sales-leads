-- Offer history / print again: the full form state of each printed offer, and a fast per-person history list.
alter table public.crm_offer_prints add column if not exists offer jsonb;
create index if not exists crm_offer_prints_by_at_ix on public.crm_offer_prints (printed_by, printed_at desc);
