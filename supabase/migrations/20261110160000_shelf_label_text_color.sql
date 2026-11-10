-- =====================================================================
--  shelves.accent_text_color · the lettering on a shelf's postit
--
--  The owner picks the card's colour freely, so no single ink reads on
--  every card. Null means "choose for me": the app letters the card in
--  white or ink by its luminance. A value is the owner's own choice.
-- =====================================================================
alter table public.shelves add column accent_text_color text;
