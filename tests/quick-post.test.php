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

$previous_settings = get_option( KOTOTSUGI_QUICK_POST_OPTION, null );
$post_id           = 0;
$attachment_ids    = array();
$image_tmp         = tempnam( sys_get_temp_dir(), 'kototsugi-quick-post-' );
$test_post_type    = 'kototsugi_qp_test';
$request_id        = 'kototsugi-quick-post-test-' . wp_generate_uuid4();
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
	$assert( isset( kototsugi_quick_post_types()[ $test_post_type ] ), 'An editable custom post type should be available as a publishing destination.' );

	$session = kototsugi_create_quick_post_session( $settings );
	$assert( kototsugi_verify_quick_post_session( $session, $settings ), 'A valid Quick Post session should be accepted.' );
	$assert( ! kototsugi_verify_quick_post_session( $session . 'tampered', $settings ), 'A modified Quick Post session must be rejected.' );

	$form_token = kototsugi_quick_post_form_token( 'publish', $session );
	$assert( kototsugi_verify_quick_post_form_token( $form_token, 'publish', $session ), 'A valid form token should be accepted.' );
	$assert( ! kototsugi_verify_quick_post_form_token( $form_token, 'logout', $session ), 'A form token must be bound to its action.' );

	$assert( kototsugi_quick_post_blocks_are_allowed( parse_blocks( $safe_content ) ), 'Standard paragraph and list blocks should be accepted.' );
	$assert(
		! kototsugi_quick_post_blocks_are_allowed( parse_blocks( '<!-- wp:html --><script>alert(1)</script><!-- /wp:html -->' ) ),
		'Custom HTML blocks must be rejected.'
	);
	$attribute_test = kototsugi_sanitize_quick_post_blocks(
		parse_blocks( '<!-- wp:paragraph {"style":{"background":{"backgroundImage":{"url":"javascript:alert(1)"}}}} --><p>Safe text.</p><!-- /wp:paragraph -->' )
	);
	$assert( empty( $attribute_test[0]['attrs'] ), 'Unsupported block attributes must be removed before insertion.' );

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

	echo "KOTOTSUGI Quick Post: all tests passed.\n";
} catch ( Throwable $error ) {
	fwrite( STDERR, $error->getMessage() . "\n" );
	exit( 1 );
} finally {
	delete_transient( $duplicate_key );
	foreach ( $attachment_ids as $attachment_id ) {
		wp_delete_attachment( $attachment_id, true );
	}
	if ( $post_id && ! is_wp_error( $post_id ) ) {
		wp_delete_post( $post_id, true );
	}
	if ( $image_tmp && file_exists( $image_tmp ) ) {
		unlink( $image_tmp );
	}
	if ( null === $previous_settings ) {
		delete_option( KOTOTSUGI_QUICK_POST_OPTION );
	} else {
		update_option( KOTOTSUGI_QUICK_POST_OPTION, $previous_settings, false );
	}
	unregister_post_type( $test_post_type );
}
