CREATE POLICY "homepage media readable by everyone"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'homepage-media');

CREATE POLICY "staff can upload homepage media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'homepage-media' AND private.is_staff(auth.uid()));

CREATE POLICY "staff can replace homepage media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'homepage-media' AND private.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'homepage-media' AND private.is_staff(auth.uid()));

CREATE POLICY "staff can delete homepage media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'homepage-media' AND private.is_staff(auth.uid()));