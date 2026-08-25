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
	for ( $attempt = 0; $attempt < 5; ++$attempt ) {
		$assert( kototsugi_claim_quick_post_login_attempt(), 'The first five login attempts should be reserved.' );
	}
	$assert( ! kototsugi_claim_quick_post_login_attempt(), 'A sixth login attempt must be throttled.' );

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
