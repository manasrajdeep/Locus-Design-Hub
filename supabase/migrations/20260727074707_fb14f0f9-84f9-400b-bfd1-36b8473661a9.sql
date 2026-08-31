
DO $$
DECLARE
  super_id uuid;
  cust_a uuid := gen_random_uuid();
  cust_b uuid := gen_random_uuid();
  proj_a uuid;
  proj_b uuid;
  upd_a uuid;
  upd_b uuid;
  doc_a uuid;
  doc_b uuid;
  msg_a uuid;
  msg_b uuid;
  n int;
  fail_count int := 0;
  results text := '';
BEGIN
  SELECT id INTO super_id FROM auth.users WHERE email = 'manasrajdeep@outlook.com';

  -- Whitelist + create two fake customer auth users. The handle_new_user trigger
  -- will create their profiles + assign the customer role.
  INSERT INTO public.customer_whitelist(email, invited_by) VALUES
    ('rls-test-a@example.com', super_id),
    ('rls-test-b@example.com', super_id);

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (cust_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-a@example.com', crypt('x', gen_salt('bf')), now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb),
    (cust_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-b@example.com', crypt('x', gen_salt('bf')), now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb);

  INSERT INTO public.projects(name, address, customer_id, assigned_admin_id, milestones, current_milestone)
    VALUES ('RLS Test A','A st', cust_a, super_id, '[{"name":"Foundation","status":"in_progress"}]'::jsonb, 0)
    RETURNING id INTO proj_a;
  INSERT INTO public.projects(name, address, customer_id, assigned_admin_id, milestones, current_milestone)
    VALUES ('RLS Test B','B st', cust_b, super_id, '[{"name":"Foundation","status":"in_progress"}]'::jsonb, 0)
    RETURNING id INTO proj_b;

  INSERT INTO public.project_updates(project_id, image_url, caption, created_by)
    VALUES (proj_a, 'a/x.jpg','A', super_id) RETURNING id INTO upd_a;
  INSERT INTO public.project_updates(project_id, image_url, caption, created_by)
    VALUES (proj_b, 'b/x.jpg','B', super_id) RETURNING id INTO upd_b;

  INSERT INTO public.project_documents(project_id, name, file_path, kind, uploaded_by)
    VALUES (proj_a,'A.pdf','a/A.pdf','contract', super_id) RETURNING id INTO doc_a;
  INSERT INTO public.project_documents(project_id, name, file_path, kind, uploaded_by)
    VALUES (proj_b,'B.pdf','b/B.pdf','contract', super_id) RETURNING id INTO doc_b;

  INSERT INTO public.messages(project_id, sender_id, body)
    VALUES (proj_a, super_id, 'hello A') RETURNING id INTO msg_a;
  INSERT INTO public.messages(project_id, sender_id, body)
    VALUES (proj_b, super_id, 'hello B') RETURNING id INTO msg_b;

  RAISE NOTICE '--- Seeded: super=%, custA=%, custB=%, projA=%, projB=% ---', super_id, cust_a, cust_b, proj_a, proj_b;

  -- Helper: run as authenticated with given uid and count visible rows
  PERFORM set_config('role', 'authenticated', true);

  -- Customer A perspective
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cust_a::text, 'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.projects; RAISE NOTICE 'custA projects visible: % (expect 1)', n; IF n<>1 THEN fail_count:=fail_count+1; END IF;
  SELECT count(*) INTO n FROM public.projects WHERE id = proj_b; RAISE NOTICE 'custA sees projB: % (expect 0)', n; IF n<>0 THEN fail_count:=fail_count+1; END IF;
  SELECT count(*) INTO n FROM public.project_updates WHERE project_id = proj_b; RAISE NOTICE 'custA sees updates of projB: % (expect 0)', n; IF n<>0 THEN fail_count:=fail_count+1; END IF;
  SELECT count(*) INTO n FROM public.project_documents WHERE project_id = proj_b; RAISE NOTICE 'custA sees docs of projB: % (expect 0)', n; IF n<>0 THEN fail_count:=fail_count+1; END IF;
  SELECT count(*) INTO n FROM public.messages WHERE project_id = proj_b; RAISE NOTICE 'custA sees msgs of projB: % (expect 0)', n; IF n<>0 THEN fail_count:=fail_count+1; END IF;
  SELECT count(*) INTO n FROM public.project_updates WHERE project_id = proj_a; RAISE NOTICE 'custA sees own updates: % (expect 1)', n; IF n<>1 THEN fail_count:=fail_count+1; END IF;
  SELECT count(*) INTO n FROM public.customer_whitelist; RAISE NOTICE 'custA sees whitelist rows: % (expect 0)', n; IF n<>0 THEN fail_count:=fail_count+1; END IF;
  SELECT count(*) INTO n FROM public.user_roles; RAISE NOTICE 'custA sees user_roles rows: % (expect 1, own)', n; IF n<>1 THEN fail_count:=fail_count+1; END IF;
  SELECT count(*) INTO n FROM public.profiles; RAISE NOTICE 'custA sees profiles: % (expect 1, own)', n; IF n<>1 THEN fail_count:=fail_count+1; END IF;

  -- Test write blocking: A tries to insert a message into B's project
  BEGIN
    INSERT INTO public.messages(project_id, sender_id, body) VALUES (proj_b, cust_a, 'sneaky');
    RAISE NOTICE 'custA INSERT into projB messages: ALLOWED (expect blocked)'; fail_count:=fail_count+1;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'custA INSERT into projB messages: BLOCKED (ok)';
  END;

  -- Customer B perspective
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cust_b::text, 'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.projects; RAISE NOTICE 'custB projects visible: % (expect 1)', n; IF n<>1 THEN fail_count:=fail_count+1; END IF;
  SELECT count(*) INTO n FROM public.messages WHERE project_id = proj_a; RAISE NOTICE 'custB sees msgs of projA: % (expect 0)', n; IF n<>0 THEN fail_count:=fail_count+1; END IF;

  -- Superadmin perspective
  PERFORM set_config('request.jwt.claims', json_build_object('sub', super_id::text, 'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.projects WHERE id IN (proj_a, proj_b); RAISE NOTICE 'super sees both test projects: % (expect 2)', n; IF n<>2 THEN fail_count:=fail_count+1; END IF;
  SELECT count(*) INTO n FROM public.customer_whitelist WHERE email LIKE 'rls-test-%'; RAISE NOTICE 'super sees whitelist rows: % (expect 2)', n; IF n<>2 THEN fail_count:=fail_count+1; END IF;
  SELECT count(*) INTO n FROM public.messages WHERE project_id IN (proj_a, proj_b); RAISE NOTICE 'super sees messages: % (expect 2)', n; IF n<>2 THEN fail_count:=fail_count+1; END IF;

  -- Anon perspective (public homepage)
  PERFORM set_config('role','anon',true);
  PERFORM set_config('request.jwt.claims','',true);
  SELECT count(*) INTO n FROM public.homepage_content; RAISE NOTICE 'anon homepage_content: % (expect >=1)', n; IF n<1 THEN fail_count:=fail_count+1; END IF;
  BEGIN
    SELECT count(*) INTO n FROM public.projects;
    RAISE NOTICE 'anon projects readable: % (expect 0 or blocked)', n; IF n<>0 THEN fail_count:=fail_count+1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'anon projects: BLOCKED by grant (ok)';
  END;

  -- Reset role for cleanup
  PERFORM set_config('role','postgres',true);
  PERFORM set_config('request.jwt.claims','',true);

  -- Cleanup: delete auth.users cascades to profiles, user_roles, projects, updates, docs, messages
  DELETE FROM auth.users WHERE id IN (cust_a, cust_b);
  DELETE FROM public.customer_whitelist WHERE email IN ('rls-test-a@example.com','rls-test-b@example.com');

  RAISE NOTICE '=== RLS verification complete. Failures: % ===', fail_count;
  IF fail_count > 0 THEN
    RAISE EXCEPTION 'RLS verification failed with % check(s)', fail_count;
  END IF;
END $$;
