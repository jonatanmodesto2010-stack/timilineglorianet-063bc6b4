
UPDATE organization_integrations
SET api_url = 'https://ixc.glorianet.com.br/webservice/v1',
    api_url_contracts = NULL,
    updated_at = now()
WHERE id = '596bef6d-83b5-474d-9684-6b68cc12dac0';
