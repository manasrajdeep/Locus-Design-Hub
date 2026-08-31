UPDATE public.homepage_content
SET hero_image_url = '/__l5e/assets-v1/cacb7b15-8f2c-4093-83e6-e9efd8da7f6f/in-hero.jpg',
    portfolio = '[
      {"image_url":"/__l5e/assets-v1/cde8a0d9-793c-4ae3-b582-784c23f266b1/in-p1.jpg","caption":"Chandigarh Residence, Punjab"},
      {"image_url":"/__l5e/assets-v1/be2135e5-de90-48b6-8961-5d11f5ce67be/in-p2.jpg","caption":"Jaipur Courtyard Farmhouse, Rajasthan"},
      {"image_url":"/__l5e/assets-v1/6a0cba2b-40dd-4d68-9b3b-b31f8ce03e3f/in-p3.jpg","caption":"Cyber City Corporate Tower, Gurugram"},
      {"image_url":"/__l5e/assets-v1/c3ded41b-ab1b-491e-808f-ca5949d6b017/in-p4.jpg","caption":"Sector 150 Residences, Noida"},
      {"image_url":"/__l5e/assets-v1/962f28a2-0719-448a-93e7-26dbd56f2b41/in-p5.jpg","caption":"Hazratganj Retail Pavilion, Lucknow"},
      {"image_url":"/__l5e/assets-v1/87d8709f-788e-436f-a8b9-120a5abc7802/in-p6.jpg","caption":"Deodar Hill Retreat, Shimla"}
    ]'::jsonb,
    updated_at = now();