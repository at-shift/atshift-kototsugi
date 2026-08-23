<?php
/**
 * KOTOTSUGI remote image integration test.
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

if ( ! function_exists( 'kototsugi_register_rest_routes' ) ) {
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

$attachment_id = 0;
$post_id       = 0;
$restricted_user_id = 0;
$remote_url    = 'https://93.184.216.34/kototsugi-test.png';
$png_bytes     = base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true );

$http_mock = static function ( $preempt, $args, $url ) use ( $remote_url, $png_bytes ) {
	if ( $remote_url !== $url ) {
		return $preempt;
	}

	if ( empty( $args['filename'] ) || false === file_put_contents( $args['filename'], $png_bytes ) ) {
		return new WP_Error( 'kototsugi_test_write_failed', 'Could not write the test image.' );
	}

	return array(
		'headers'  => array( 'content-type' => 'image/png' ),
		'body'     => '',
		'response' => array(
			'code'    => 200,
			'message' => 'OK',
		),
		'cookies'  => array(),
		'filename' => $args['filename'],
	);
};

try {
	wp_set_current_user( $admins[0]->ID );
	$assert( kototsugi_can_import_remote_images(), 'Administrators with upload_files should pass the permission check.' );
	$assert( ! kototsugi_is_safe_remote_image_url( 'http://127.0.0.1/private.png' ), 'Loopback image URLs must be rejected.' );
	$assert( ! kototsugi_is_safe_remote_image_url( 'http://169.254.169.254/metadata.png' ), 'Metadata service URLs must be rejected.' );

	$post_id = wp_insert_post(
		array(
			'post_title'  => 'KOTOTSUGI image import test',
			'post_status' => 'draft',
			'post_type'   => 'post',
		),
		true
	);
	$assert( ! is_wp_error( $post_id ), 'The image test post could not be created.' );

	add_filter( 'pre_http_request', $http_mock, 10, 3 );

	$request = new WP_REST_Request( 'POST', '/kototsugi/v1/images/import' );
	$request->set_param( 'url', $remote_url );
	$request->set_param( 'alt', 'KOTOTSUGI test image' );
	$request->set_param( 'post_id', $post_id );
	$response = kototsugi_import_remote_image( $request );
	if ( is_wp_error( $response ) ) {
		throw new RuntimeException( 'The mocked remote image import failed: ' . $response->get_error_code() . ' - ' . $response->get_error_message() );
	}

	$data          = $response->get_data();
	$attachment_id = isset( $data['id'] ) ? (int) $data['id'] : 0;
	$assert( $attachment_id > 0, 'The image import did not return an attachment ID.' );
	$assert( 'image/png' === get_post_mime_type( $attachment_id ), 'The attachment MIME type is not image/png.' );
	$assert( (int) $post_id === (int) wp_get_post_parent_id( $attachment_id ), 'The image was not attached to the current post.' );
	$assert( 'KOTOTSUGI test image' === get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ), 'The image alt text was not saved.' );
	$assert( $remote_url === get_post_meta( $attachment_id, '_kototsugi_source_url', true ), 'The source URL was not saved.' );
	$assert( file_exists( get_attached_file( $attachment_id ) ), 'The imported image file does not exist.' );

	$second_response = kototsugi_import_remote_image( $request );
	$assert( ! is_wp_error( $second_response ), 'The duplicate image lookup failed.' );
	$second_data = $second_response->get_data();
	$assert( $attachment_id === (int) $second_data['id'], 'The duplicate source URL created another attachment.' );
	$assert( ! empty( $second_data['reused'] ), 'The duplicate image response was not marked as reused.' );

	$restricted_user_id = wp_insert_user(
		array(
			'user_login' => 'kototsugi-uploader-' . strtolower( wp_generate_password( 8, false, false ) ),
			'user_pass'  => wp_generate_password( 24, true, true ),
			'user_email' => 'kototsugi-media-' . wp_generate_uuid4() . '@example.test',
			'role'       => 'author',
		)
	);
	$assert( ! is_wp_error( $restricted_user_id ), 'The restricted media test user could not be created.' );
	wp_set_current_user( $restricted_user_id );
	$reuse_request = new WP_REST_Request( 'POST', '/kototsugi/v1/images/import' );
	$reuse_request->set_param( 'url', $remote_url );
	$reuse_request->set_param( 'alt', 'Unauthorized replacement text' );
	$reuse_response = kototsugi_import_remote_image( $reuse_request );
	$assert( is_wp_error( $reuse_response ) && 'kototsugi_image_reuse_forbidden' === $reuse_response->get_error_code(), 'A user without edit access must not reuse or modify another author\'s attachment.' );
	$assert( 'KOTOTSUGI test image' === get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ), 'A rejected reuse must not change attachment alternative text.' );
	wp_set_current_user( $admins[0]->ID );

	$unsafe_request = new WP_REST_Request( 'POST', '/kototsugi/v1/images/import' );
	$unsafe_request->set_param( 'url', 'http://127.0.0.1/private.png' );
	$unsafe_response = kototsugi_import_remote_image( $unsafe_request );
	$assert( is_wp_error( $unsafe_response ) && 'kototsugi_unsafe_image_url' === $unsafe_response->get_error_code(), 'Unsafe image URL rejection failed.' );

	wp_set_current_user( 0 );
	$assert( ! kototsugi_can_import_remote_images(), 'Logged-out users must not pass the image import permission check.' );

	echo "KOTOTSUGI media import: all tests passed.\n";
} catch ( Throwable $error ) {
	fwrite( STDERR, $error->getMessage() . "\n" );
	exit( 1 );
} finally {
	remove_filter( 'pre_http_request', $http_mock, 10 );
	if ( $attachment_id ) {
		wp_delete_attachment( $attachment_id, true );
	}
	if ( $post_id && ! is_wp_error( $post_id ) ) {
		wp_delete_post( $post_id, true );
	}
	if ( $restricted_user_id && ! is_wp_error( $restricted_user_id ) ) {
		require_once ABSPATH . 'wp-admin/includes/user.php';
		wp_delete_user( $restricted_user_id );
	}
}
