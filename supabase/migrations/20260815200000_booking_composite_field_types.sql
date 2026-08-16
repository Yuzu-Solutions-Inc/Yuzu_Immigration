-- Composite booking form field types (address, phone with country/type, passport)
alter type public.booking_form_field_type add value if not exists 'address';
alter type public.booking_form_field_type add value if not exists 'phone_contact';
alter type public.booking_form_field_type add value if not exists 'passport';
