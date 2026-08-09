alter table public.products
add column if not exists is_package boolean not null default false;

comment on column public.products.is_package is
'false = produto vendido por kg (preco x peso). true = produto vendido por pacote (preco final sem multiplicacao).';
