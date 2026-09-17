<?php
/**
 * KOTOTSUGI Quick Post integration test.
 *
 * Run with KOTOTSUGI_WP_ROOT pointing to a local WordPress installation.
 */

$wp_root = getenv( 'KOTOTSUGI_WP_ROOT' );

if ( ! $wp_root || ! file_exists( $wp_root . '/wp-load.php' ) ) {
	fwrite( STDERR, "KOTOTSUGI_WP_ROOT must point to a WordPress installation.\n" );
	exit( 1 );
}

define( 'WP_USE_THEMES', false );
require $wp_root . '/wp-load.php';

if ( ! function_exists( 'kototsugi_insert_quick_post' ) ) {
	require dirname( __DIR__ ) . '/kototsugi.php';
}

$assert = static function ( $condition, $message ) {
	if ( ! $condition ) {
		throw new RuntimeException( $message );
	}
};

$admins = get_users(
	array(
		'role'   => 'administrator',
		'number' => 1,
	)
);

if ( ! $admins ) {
	fwrite( STDERR, "No local administrator account is available.\n" );
	exit( 1 );
}

$previous_settings  = get_option( KOTOTSUGI_QUICK_POST_OPTION, null );
$post_id            = 0;
$published_post_id  = 0;
$attachment_ids     = array();
$image_tmp          = tempnam( sys_get_temp_dir(), 'kototsugi-quick-post-' );
$test_post_type     = 'kototsugi_qp_test';
$locked_post_type   = 'kototsugi_qp_locked';
$request_id         = 'kototsugi-quick-post-test-' . wp_generate_uuid4();
$session_keys       = array();
$restricted_user_id = 0;
$throttle_key       = '';
$previous_address   = isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : null;
$extra_duplicate_keys = array();
$trusted_throttle_keys = array();
// null means the site-wide login alert state was not touched yet.
$previous_login_failures = null;
$previous_alert_sent     = null;
$png_bytes         = base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true );
if ( ! $image_tmp || false === file_put_contents( $image_tmp, $png_bytes ) ) {
	throw new RuntimeException( 'The Quick Post image fixture could not be created.' );
}
register_post_type(
	$test_post_type,
	array(
		'public'   => false,
		'show_ui'  => true,
		'supports' => array( 'title', 'editor' ),
	)
);
register_post_type(
	$locked_post_type,
	array(
		'public'       => false,
		'show_ui'      => true,
		'supports'     => array( 'title', 'editor' ),
		'capabilities' => array(
			'edit_posts'   => 'edit_posts',
			'create_posts' => 'kototsugi_create_locked_posts',
			'publish_posts' => 'publish_posts',
		),
	)
);
$settings          = array(
	'enabled'         => true,
	'status'          => 'draft',
	'language'        => 'site',
	'post_type'       => $test_post_type,
	'author_id'       => (int) $admins[0]->ID,
	'category_id'     => 0,
	'password_hash'   => wp_hash_password( 'kototsugi-test-passphrase' ),
	'session_version' => 1,
);
$safe_content      = '<!-- wp:paragraph -->' . "\n" . '<p>Quick Post paragraph.</p>' . "\n" . '<!-- /wp:paragraph -->' . "\n\n" .
	'<!-- wp:list -->' . "\n" . '<ul class="wp-block-list"><!-- wp:list-item -->' . "\n" . '<li>One</li>' . "\n" . '<!-- /wp:list-item --></ul>' . "\n" . '<!-- /wp:list -->' . "\n\n" .
	'<!-- wp:paragraph -->' . "\n" . '<p><strong>Phone:</strong> <a href="tel:0750000000">075-000-0000</a></p>' . "\n" . '<!-- /wp:paragraph -->';
$duplicate_key     = 'kototsugi_qp_post_' . substr( hash_hmac( 'sha256', sanitize_key( $request_id ), wp_salt( 'nonce' ) ), 0, 32 );

try {
	update_option( KOTOTSUGI_QUICK_POST_OPTION, $settings, false );

	$japanese_passphrase = '日本語の合言葉です';
	$assert( 9 === kototsugi_quick_post_passphrase_length( $japanese_passphrase ), 'Japanese passphrases should be counted as characters, not bytes.' );
	$assert( 3 === kototsugi_quick_post_passphrase_length( '日本語' ), 'A short Japanese passphrase should remain shorter than the minimum.' );
	$assert( wp_check_password( $japanese_passphrase, wp_hash_password( $japanese_passphrase ) ), 'Japanese passphrases should survive hashing and verification unchanged.' );
	$quick_post_languages = kototsugi_quick_post_languages();
	$expected_languages   = kototsugi_quick_post_locale_codes();
	$assert( $expected_languages === array_keys( $quick_post_languages ), 'Quick Post should offer every bundled display language in the intended order.' );
	$notation_profiles = kototsugi_quick_post_notation_profiles();
	$assert( $expected_languages === array_keys( $notation_profiles ), 'Every bundled language should have a Quick Post notation profile.' );
	foreach ( $notation_profiles as $notation_locale => $notation_profile ) {
		$assert( array( 'list', 'place', 'important', 'note', 'price', 'phone', 'currency' ) === array_keys( $notation_profile ), 'Every notation profile should provide all writing hint types and a default currency format.' );
		$assert( '-' === $notation_profile['list'], 'Writing hints should use a keyboard-friendly list marker in every language.' );
		$assert( '' !== $notation_profile['price'], 'Every notation profile should provide a language-appropriate price example.' );
		$assert( isset( $notation_profile['currency']['before'], $notation_profile['currency']['after'], $notation_profile['currency']['space'] ), 'Every notation profile should define the default currency position.' );
		$assert( $notation_profile === kototsugi_quick_post_notation_profile( $notation_locale ), 'Each locale should resolve to its own notation profile.' );
	}
	$assert( 'Price: $10 / $ 1000' === kototsugi_quick_post_notation_profile( 'en_GB' )['price'], 'Related locale variants should use the matching language profile.' );
	$assert( 'Price: $10 / $ 1000' === kototsugi_quick_post_notation_profile( 'xx_XX' )['price'], 'Unknown locales should use the English notation profile.' );
	$expected_sample_files = array(
		'ja'    => 'kototsugi-sample.md',
		'en_US' => 'kototsugi-sample-en.md',
		'es_ES' => 'kototsugi-sample-es_ES.md',
		'de_DE' => 'kototsugi-sample-de_DE.md',
		'fr_FR' => 'kototsugi-sample-fr_FR.md',
		'pt_BR' => 'kototsugi-sample-pt_BR.md',
		'it_IT' => 'kototsugi-sample-it_IT.md',
		'ru_RU' => 'kototsugi-sample-ru_RU.md',
		'nl_NL' => 'kototsugi-sample-nl_NL.md',
		'zh_CN' => 'kototsugi-sample-zh_CN.md',
		'pl_PL' => 'kototsugi-sample-pl_PL.md',
		'tr_TR' => 'kototsugi-sample-tr_TR.md',
		'id_ID' => 'kototsugi-sample-id_ID.md',
		'zh_TW' => 'kototsugi-sample-zh_TW.md',
		'ko_KR' => 'kototsugi-sample-ko_KR.md',
	);
	foreach ( $expected_sample_files as $sample_locale => $sample_file ) {
		$assert( $sample_file === kototsugi_sample_markdown_name( $sample_locale ), 'Each bundled locale should resolve to its localized sample.' );
		$assert( file_exists( dirname( __DIR__ ) . '/examples/' . $sample_file ), 'Every localized sample file should exist.' );
	}
	$assert( 'kototsugi-sample-en.md' === kototsugi_sample_markdown_name( 'en_GB' ), 'Unsupported locales should use the English sample.' );
	$original_locale = determine_locale();
	kototsugi_switch_quick_post_locale( array( 'language' => 'es_ES' ) );
	$assert( 'es_ES' === determine_locale(), 'Quick Post should switch to a bundled locale without requiring a WordPress language pack.' );
	$assert( 'Quick Post' !== __( 'Quick Post', 'kototsugi' ), 'Quick Post should load the bundled translation for the selected locale.' );
	if ( 'es_ES' !== $original_locale ) {
		restore_previous_locale();
	}
	$assert( isset( kototsugi_quick_post_types()[ $test_post_type ] ), 'An editable custom post type should be available as a publishing destination.' );

	$session = kototsugi_create_quick_post_session( $settings );
	$session_data = kototsugi_get_quick_post_session( $session, $settings );
	$session_keys[] = kototsugi_quick_post_session_key( $session_data['session_id'] );
	$assert( kototsugi_verify_quick_post_session( $session, $settings ), 'A valid Quick Post session should be accepted.' );
	$assert( ! kototsugi_verify_quick_post_session( $session . 'tampered', $settings ), 'A modified Quick Post session must be rejected.' );
	$first_storage_key = kototsugi_quick_post_storage_key( $session, $settings );
	kototsugi_revoke_quick_post_session( $session, $settings );
	$assert( ! kototsugi_verify_quick_post_session( $session, $settings ), 'A logged-out Quick Post session must be rejected server-side.' );
	$session = kototsugi_create_quick_post_session( $settings );
	$session_data = kototsugi_get_quick_post_session( $session, $settings );
	$session_keys[] = kototsugi_quick_post_session_key( $session_data['session_id'] );
	$assert( $first_storage_key !== kototsugi_quick_post_storage_key( $session, $settings ), 'Browser draft storage must be scoped to one session.' );

	$form_token = kototsugi_quick_post_form_token( 'publish', $session );
	$assert( kototsugi_verify_quick_post_form_token( $form_token, 'publish', $session ), 'A valid form token should be accepted.' );
	$assert( ! kototsugi_verify_quick_post_form_token( $form_token, 'logout', $session ), 'A form token must be bound to its action.' );
	$receipt = kototsugi_quick_post_receipt_token( 123, $session );
	$assert( kototsugi_verify_quick_post_receipt_token( $receipt, 123, $session ), 'A completion receipt should match its post and session.' );
	$assert( ! kototsugi_verify_quick_post_receipt_token( $receipt, 124, $session ), 'A completion receipt must not match another post.' );

	$_SERVER['REMOTE_ADDR'] = '192.0.2.55';
	$throttle_key = kototsugi_quick_post_throttle_key();
	delete_transient( $throttle_key );
	for ( $attempt = 1; $attempt <= 4; ++$attempt ) {
		$assert( 0 === kototsugi_claim_quick_post_login_attempt(), 'Three failures and the following check should proceed without waiting.' );
	}
	$wait = kototsugi_claim_quick_post_login_attempt();
	$assert( $wait > 0 && $wait <= MINUTE_IN_SECONDS, 'The fourth failure should start a one-minute wait.' );
	$throttle_state                 = get_transient( $throttle_key );
	$throttle_state['locked_until'] = time() - 1;
	set_transient( $throttle_key, $throttle_state, DAY_IN_SECONDS );
	$assert( 0 === kototsugi_claim_quick_post_login_attempt(), 'A check should proceed after the wait ends.' );
	$wait = kototsugi_claim_quick_post_login_attempt();
	$assert( $wait > 4 * MINUTE_IN_SECONDS && $wait <= 5 * MINUTE_IN_SECONDS, 'The fifth failure should start a five-minute wait.' );
	$assert(
		0 === kototsugi_quick_post_login_delay( 3 ) && 15 * MINUTE_IN_SECONDS === kototsugi_quick_post_login_delay( 6 ) && HOUR_IN_SECONDS === kototsugi_quick_post_login_delay( 7 ) && HOUR_IN_SECONDS === kototsugi_quick_post_login_delay( 50 ),
		'Waits should grow to 15 minutes and stop at one hour.'
	);
	$assert( kototsugi_quick_post_login_failures() >= 5, 'The current failure count should be readable for the error message.' );
	$assert( __( 'The passphrase is not correct.', 'kototsugi' ) === kototsugi_quick_post_login_error_message( 2 ), 'Early failures should show only the incorrect passphrase message.' );
	$assert(
		sprintf( _n( 'The passphrase is not correct. If the next one is also incorrect, you will need to wait %d minute. Check uppercase and lowercase letters and the keyboard input mode.', 'The passphrase is not correct. If the next one is also incorrect, you will need to wait %d minutes. Check uppercase and lowercase letters and the keyboard input mode.', 1, 'kototsugi' ), 1 ) === kototsugi_quick_post_login_error_message( 3 ),
		'The last failure before a wait should warn about the one-minute wait.'
	);
	$assert(
		sprintf( _n( 'The passphrase is not correct. Wait %d minute and try again.', 'The passphrase is not correct. Wait %d minutes and try again.', 5, 'kototsugi' ), 5 ) === kototsugi_quick_post_login_error_message( 5 ),
		'A failure that starts a wait should say how long to wait.'
	);
	kototsugi_reset_quick_post_login_failures();
	$assert( 0 === kototsugi_claim_quick_post_login_attempt(), 'A successful sign-in should clear earlier failures.' );
	kototsugi_reset_quick_post_login_failures();

	$trusted_token = kototsugi_create_quick_post_trusted_token( $settings );
	$assert( kototsugi_is_quick_post_trusted_browser( $trusted_token, $settings ), 'A browser that entered the passphrase should be trusted.' );
	$other_trusted_token = kototsugi_create_quick_post_trusted_token( $settings );
	$assert( $trusted_token !== $other_trusted_token, 'Each trusted browser must receive a different token.' );
	$trusted_throttle_keys[] = kototsugi_quick_post_throttle_key( $trusted_token );
	$trusted_throttle_keys[] = kototsugi_quick_post_throttle_key( $other_trusted_token );
	for ( $attempt = 0; $attempt < 4; ++$attempt ) {
		$assert( 0 === kototsugi_claim_quick_post_login_attempt( $trusted_token ), 'A trusted browser should get its own attempts.' );
	}
	$assert( kototsugi_claim_quick_post_login_attempt( $trusted_token ) > 0, 'A trusted browser must be throttled after repeated mistakes.' );
	$assert( 0 === kototsugi_claim_quick_post_login_attempt( $other_trusted_token ), 'Another trusted browser must not inherit the first browser wait.' );
	$assert( 0 === kototsugi_claim_quick_post_login_attempt(), 'Trusted-browser failures must not lock the shared address.' );
	kototsugi_reset_quick_post_login_failures( $trusted_token );
	$assert( 0 === kototsugi_quick_post_login_failures( $trusted_token ), 'A successful trusted-browser sign-in should clear only its own failures.' );
	kototsugi_reset_quick_post_login_failures( $other_trusted_token );
	kototsugi_reset_quick_post_login_failures();
	$assert( ! kototsugi_is_quick_post_trusted_browser( $trusted_token . 'tampered', $settings ), 'A modified trusted-browser token must be rejected.' );
	$assert( ! kototsugi_is_quick_post_trusted_browser( $session, $settings ), 'A session cookie must not be accepted as a trusted-browser token.' );
	$revoked_settings                    = $settings;
	$revoked_settings['session_version'] = (int) $settings['session_version'] + 1;
	$assert( ! kototsugi_is_quick_post_trusted_browser( $trusted_token, $revoked_settings ), 'Signing out every browser must revoke trusted browsers.' );

	$previous_login_failures = get_transient( 'kototsugi_qp_login_failures' );
	$previous_alert_sent     = get_transient( 'kototsugi_qp_login_alert_sent' );
	delete_transient( 'kototsugi_qp_login_failures' );
	delete_transient( 'kototsugi_qp_login_alert_sent' );
	$alert_threshold = static function () {
		return 3;
	};
	add_filter( 'kototsugi_quick_post_login_alert_threshold', $alert_threshold );
	kototsugi_record_quick_post_login_failure();
	kototsugi_record_quick_post_login_failure();
	$assert( ! get_transient( 'kototsugi_qp_login_alert_sent' ), 'Failures below the threshold must not alert the administrator.' );
	kototsugi_record_quick_post_login_failure();
	$assert( false !== wp_next_scheduled( 'kototsugi_quick_post_login_alert', array( 3 ) ), 'Reaching the threshold should schedule an administrator alert.' );
	kototsugi_record_quick_post_login_failure();
	$assert( false === wp_next_scheduled( 'kototsugi_quick_post_login_alert', array( 4 ) ), 'Only one administrator alert should be scheduled per hour.' );
	remove_filter( 'kototsugi_quick_post_login_alert_threshold', $alert_threshold );
	wp_clear_scheduled_hook( 'kototsugi_quick_post_login_alert', array( 3 ) );

	$captured_mail = null;
	$capture_mail  = static function ( $return, $atts ) use ( &$captured_mail ) {
		$captured_mail = $atts;
		return true;
	};
	add_filter( 'pre_wp_mail', $capture_mail, 10, 2 );
	kototsugi_send_quick_post_login_alert( 3 );
	remove_filter( 'pre_wp_mail', $capture_mail, 10 );
	$assert( is_array( $captured_mail ) && get_option( 'admin_email' ) === $captured_mail['to'], 'The alert should be sent to the site administrator email address.' );
	$assert( false !== strpos( $captured_mail['message'], '3' ) && false !== strpos( $captured_mail['message'], admin_url( 'options-general.php?page=kototsugi' ) ), 'The alert should include the failure count and the settings link.' );

	$first_lock = kototsugi_quick_post_acquire_lock( 'kototsugi-lock-owner-test' );
	$assert( is_array( $first_lock ), 'The lock owner test could not acquire its first lock.' );
	update_option( $first_lock['key'], ( time() - 30 ) . ':stale-owner', false );
	$replacement_lock = kototsugi_quick_post_acquire_lock( 'kototsugi-lock-owner-test' );
	$assert( is_array( $replacement_lock ), 'A stale lock should be replaced.' );
	$assert( ! kototsugi_quick_post_release_lock( $first_lock ), 'An old owner must not release a replacement lock.' );
	$assert( $replacement_lock['owner'] === get_option( $replacement_lock['key'] ), 'The replacement lock must survive an old owner release.' );
	$assert( kototsugi_quick_post_release_lock( $replacement_lock ), 'The current owner should release its lock.' );

	$assert( kototsugi_quick_post_blocks_are_allowed( parse_blocks( $safe_content ) ), 'Standard paragraph and list blocks should be accepted.' );
	$assert(
		! kototsugi_quick_post_blocks_are_allowed( parse_blocks( '<!-- wp:html --><script>alert(1)</script><!-- /wp:html -->' ) ),
		'Custom HTML blocks must be rejected.'
	);
	$attribute_test = kototsugi_sanitize_quick_post_blocks(
		parse_blocks( '<!-- wp:paragraph {"style":{"background":{"backgroundImage":{"url":"javascript:alert(1)"}}}} --><p>Safe text.</p><!-- /wp:paragraph -->' )
	);
	$assert( empty( $attribute_test[0]['attrs'] ), 'Unsupported block attributes must be removed before insertion.' );
	$nested_blocks = array(
		array(
			'blockName'   => 'core/paragraph',
			'innerHTML'   => '<p>Nested.</p>',
			'innerBlocks' => array(),
		),
	);
	for ( $depth = 0; $depth < KOTOTSUGI_QUICK_POST_MAX_BLOCK_DEPTH; ++$depth ) {
		$nested_blocks = array(
			array(
				'blockName'   => 'core/group',
				'innerHTML'   => '<div class="wp-block-group"></div>',
				'innerBlocks' => $nested_blocks,
			),
		);
	}
	$assert( ! kototsugi_quick_post_blocks_are_allowed( $nested_blocks ), 'Block trees deeper than the server limit must be rejected.' );
	$wide_blocks = array_fill(
		0,
		KOTOTSUGI_QUICK_POST_MAX_BLOCKS + 1,
		array(
			'blockName'   => 'core/paragraph',
			'innerHTML'   => '<p>Many.</p>',
			'innerBlocks' => array(),
		)
	);
	$assert( ! kototsugi_quick_post_blocks_are_allowed( $wide_blocks ), 'Block trees over the server count limit must be rejected.' );

	$locked_settings = array_merge( $settings, array( 'post_type' => $locked_post_type ) );
	$locked_result = kototsugi_insert_quick_post(
		array(
			'title'       => 'Locked content type',
			'source'      => 'Locked content type',
			'content'     => $safe_content,
			'idempotency' => 'kototsugi-locked-' . wp_generate_uuid4(),
		),
		$locked_settings
	);
	$assert( is_wp_error( $locked_result ) && 'kototsugi_quick_post_author_invalid' === $locked_result->get_error_code(), 'The configured author must have the CPT create_posts capability.' );

	$restricted_user_id = wp_insert_user(
		array(
			'user_login' => 'kototsugi-restricted-' . strtolower( wp_generate_password( 8, false, false ) ),
			'user_pass'  => wp_generate_password( 24, true, true ),
			'user_email' => 'kototsugi-' . wp_generate_uuid4() . '@example.test',
			'role'       => 'contributor',
		)
	);
	$assert( ! is_wp_error( $restricted_user_id ), 'The restricted upload test user could not be created.' );
	$forbidden_upload = kototsugi_upload_quick_post_images(
		array(
			'name'     => 'forbidden.png',
			'type'     => 'image/png',
			'tmp_name' => $image_tmp,
			'error'    => UPLOAD_ERR_OK,
			'size'     => filesize( $image_tmp ),
		),
		array(),
		0,
		$restricted_user_id
	);
	$assert( is_wp_error( $forbidden_upload ) && 'kototsugi_quick_post_image_forbidden' === $forbidden_upload->get_error_code(), 'An author without upload_files must not create attachments.' );

	$post_id = kototsugi_insert_quick_post(
		array(
			'title'       => 'KOTOTSUGI Quick Post test',
			'source'      => "# KOTOTSUGI Quick Post test\n\n- One",
			'content'     => $safe_content,
			'excerpt'     => 'Quick Post integration test.',
			'slug'        => 'kototsugi-quick-post-test',
			'idempotency' => $request_id,
		),
		$settings,
		array(
			'name'     => 'quick-post-test.png',
			'type'     => 'image/png',
			'tmp_name' => $image_tmp,
			'error'    => UPLOAD_ERR_OK,
			'size'     => filesize( $image_tmp ),
		),
		array( 'Quick Post test image' )
	);
	$assert( ! is_wp_error( $post_id ), 'A valid Quick Post draft should be created.' );
	$assert( 'draft' === get_post_status( $post_id ), 'The configured draft status should be applied.' );
	$assert( $test_post_type === get_post_type( $post_id ), 'The configured custom post type should be applied.' );
	$assert( false !== strpos( get_post_field( 'post_content', $post_id ), '<!-- wp:list -->' ), 'Serialized block comments should be preserved.' );
	$assert( false !== strpos( get_post_field( 'post_content', $post_id ), 'href="tel:0750000000"' ), 'Telephone links should be preserved.' );
	$assert( false !== strpos( get_post_field( 'post_content', $post_id ), '<!-- wp:image ' ), 'Uploaded images should be appended as image blocks.' );
	$assert( '1' === (string) get_post_meta( $post_id, '_kototsugi_quick_post', true ), 'The post should be marked as a Quick Post submission.' );
	$attachment_ids = get_posts(
		array(
			'fields'         => 'ids',
			'post_parent'    => $post_id,
			'post_status'    => 'inherit',
			'post_type'      => 'attachment',
			'posts_per_page' => -1,
		)
	);
	$assert( 1 === count( $attachment_ids ), 'The selected image should be saved as a post attachment.' );
	$assert( 'Quick Post test image' === get_post_meta( $attachment_ids[0], '_wp_attachment_image_alt', true ), 'The submitted image alternative text should be saved.' );
	$image_block_found = preg_match( '#<!-- wp:image [^>]*-->\s*(<figure class="wp-block-image size-large">.*?</figure>)\s*<!-- /wp:image -->#s', get_post_field( 'post_content', $post_id ), $image_block );
	$assert( 1 === $image_block_found, 'The uploaded image block markup should be readable.' );
	$assert( false !== strpos( $image_block[1], 'class="wp-image-' . (int) $attachment_ids[0] . '"' ) && false !== strpos( $image_block[1], 'alt="Quick Post test image"' ), 'The image block should reference the attachment and its alternative text.' );
	$assert( 1 !== preg_match( '/\s(?:width|height|srcset|sizes|loading|decoding)=/', $image_block[1] ), 'The image block must match the core/image save markup so the block editor accepts it.' );

	$duplicate = kototsugi_insert_quick_post(
		array(
			'title'       => 'Duplicate Quick Post test',
			'source'      => '# Duplicate Quick Post test',
			'content'     => $safe_content,
			'idempotency' => $request_id,
		),
		$settings
	);
	$assert( is_wp_error( $duplicate ) && 'kototsugi_quick_post_duplicate' === $duplicate->get_error_code(), 'A repeated request ID must not create another post.' );

	$publish_transitions = array();
	$transition_observer = static function ( $new_status, $old_status, $post ) use ( &$publish_transitions ) {
		if ( 0 === strpos( $post->post_title, 'KOTOTSUGI staged publish' ) ) {
			$publish_transitions[] = $old_status . '>' . $new_status;
		}
	};
	add_action( 'transition_post_status', $transition_observer, 10, 3 );
	$published_request = 'kototsugi-staged-' . wp_generate_uuid4();
	$extra_duplicate_keys[] = 'kototsugi_qp_post_' . substr( hash_hmac( 'sha256', sanitize_key( $published_request ), wp_salt( 'nonce' ) ), 0, 32 );
	$published_post_id = kototsugi_insert_quick_post(
		array(
			'title'       => 'KOTOTSUGI staged publish success',
			'source'      => 'Staged publish success',
			'content'     => $safe_content,
			'idempotency' => $published_request,
		),
		array_merge( $settings, array( 'status' => 'publish' ) )
	);
	$assert( ! is_wp_error( $published_post_id ) && 'publish' === get_post_status( $published_post_id ), 'A valid immediate publication should finish as published.' );
	$assert( in_array( 'draft>publish', $publish_transitions, true ), 'Immediate publication must transition from a completed draft.' );

	$publish_transitions = array();
	$failed_request = 'kototsugi-staged-failure-' . wp_generate_uuid4();
	$extra_duplicate_keys[] = 'kototsugi_qp_post_' . substr( hash_hmac( 'sha256', sanitize_key( $failed_request ), wp_salt( 'nonce' ) ), 0, 32 );
	$failed_publish = kototsugi_insert_quick_post(
		array(
			'title'       => 'KOTOTSUGI staged publish failure',
			'source'      => 'Staged publish failure',
			'content'     => $safe_content,
			'idempotency' => $failed_request,
		),
		array_merge( $settings, array( 'status' => 'publish' ) ),
		array(
			'name'     => 'invalid.png',
			'type'     => 'image/png',
			'tmp_name' => '/nonexistent-kototsugi-image',
			'error'    => UPLOAD_ERR_INI_SIZE,
			'size'     => 1,
		)
	);
	remove_action( 'transition_post_status', $transition_observer, 10 );
	$assert( is_wp_error( $failed_publish ), 'An invalid dependent image must fail the publication.' );
	$assert( ! in_array( 'draft>publish', $publish_transitions, true ), 'A failed dependent image must never transition its post to publish.' );

	echo "KOTOTSUGI Quick Post: all tests passed.\n";
} catch ( Throwable $error ) {
	fwrite( STDERR, $error->getMessage() . "\n" );
	exit( 1 );
} finally {
	delete_transient( $duplicate_key );
	foreach ( $extra_duplicate_keys as $extra_duplicate_key ) {
		delete_transient( $extra_duplicate_key );
	}
	if ( $throttle_key ) {
		delete_transient( $throttle_key );
	}
	foreach ( $trusted_throttle_keys as $trusted_throttle_key ) {
		delete_transient( $trusted_throttle_key );
	}
	wp_clear_scheduled_hook( 'kototsugi_quick_post_login_alert', array( 3 ) );
	if ( null !== $previous_login_failures ) {
		if ( false === $previous_login_failures ) {
			delete_transient( 'kototsugi_qp_login_failures' );
		} else {
			set_transient( 'kototsugi_qp_login_failures', $previous_login_failures, 2 * HOUR_IN_SECONDS );
		}
	}
	if ( null !== $previous_alert_sent ) {
		if ( false === $previous_alert_sent ) {
			delete_transient( 'kototsugi_qp_login_alert_sent' );
		} else {
			set_transient( 'kototsugi_qp_login_alert_sent', $previous_alert_sent, HOUR_IN_SECONDS );
		}
	}
	foreach ( $session_keys as $session_key ) {
		delete_transient( $session_key );
	}
	foreach ( $attachment_ids as $attachment_id ) {
		wp_delete_attachment( $attachment_id, true );
	}
	if ( $post_id && ! is_wp_error( $post_id ) ) {
		wp_delete_post( $post_id, true );
	}
	if ( $published_post_id && ! is_wp_error( $published_post_id ) ) {
		wp_delete_post( $published_post_id, true );
	}
	if ( $image_tmp && file_exists( $image_tmp ) ) {
		unlink( $image_tmp );
	}
	if ( null === $previous_settings ) {
		delete_option( KOTOTSUGI_QUICK_POST_OPTION );
	} else {
		update_option( KOTOTSUGI_QUICK_POST_OPTION, $previous_settings, false );
	}
	if ( $restricted_user_id && ! is_wp_error( $restricted_user_id ) ) {
		require_once ABSPATH . 'wp-admin/includes/user.php';
		wp_delete_user( $restricted_user_id );
	}
	if ( null === $previous_address ) {
		unset( $_SERVER['REMOTE_ADDR'] );
	} else {
		$_SERVER['REMOTE_ADDR'] = $previous_address;
	}
	unregister_post_type( $test_post_type );
	unregister_post_type( $locked_post_type );
}
