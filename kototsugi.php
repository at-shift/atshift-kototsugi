<?php
/**
 * Plugin Name: KOTOTSUGI
 * Plugin URI: https://github.com/at-shift/atshift-kototsugi
 * Description: Turn AI-friendly Markdown into editable WordPress blocks.
 * Version: 1.1
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * Author: @shift
 * Author URI: https://at-shift.net/
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: kototsugi
 * Domain Path: /languages
 *
 * @package Kototsugi
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KOTOTSUGI_VERSION', '1.1' );
define( 'KOTOTSUGI_FILE', __FILE__ );
define( 'KOTOTSUGI_URL', plugin_dir_url( __FILE__ ) );
define( 'KOTOTSUGI_MAX_REMOTE_IMAGE_BYTES', 10 * MB_IN_BYTES );

require_once plugin_dir_path( __FILE__ ) . 'includes/quick-post.php';

/**
 * Registers the authenticated endpoint used to sideload remote article images.
 */
function kototsugi_register_rest_routes() {
	register_rest_route(
		'kototsugi/v1',
		'/images/import',
		array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => 'kototsugi_import_remote_image',
			'permission_callback' => 'kototsugi_can_import_remote_images',
			'args'                => array(
				'url'     => array(
					'required'          => true,
					'type'              => 'string',
					'sanitize_callback' => 'esc_url_raw',
				),
				'alt'     => array(
					'type'              => 'string',
					'default'           => '',
					'sanitize_callback' => 'sanitize_text_field',
				),
				'post_id' => array(
					'type'              => 'integer',
					'default'           => 0,
					'sanitize_callback' => 'absint',
				),
			),
		)
	);
}
add_action( 'rest_api_init', 'kototsugi_register_rest_routes' );

/**
 * Allows image imports only for users who can upload media.
 *
 * @return bool
 */
function kototsugi_can_import_remote_images() {
	return current_user_can( 'upload_files' );
}

/**
 * Applies an additional public-IP check before WordPress performs its safe request.
 *
 * @param string $url Remote URL.
 * @return bool
 */
function kototsugi_is_safe_remote_image_url( $url ) {
	$validated_url = wp_http_validate_url( $url );

	if ( ! $validated_url ) {
		return false;
	}

	$host = wp_parse_url( $validated_url, PHP_URL_HOST );
	$ip   = $host && filter_var( $host, FILTER_VALIDATE_IP ) ? $host : ( $host ? gethostbyname( $host ) : '' );

	if ( ! $ip || ( $ip === $host && false === filter_var( $host, FILTER_VALIDATE_IP ) ) ) {
		return false;
	}

	return false !== filter_var(
		$ip,
		FILTER_VALIDATE_IP,
		FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
	);
}

/**
 * Returns a safe filename using the detected image MIME type.
 *
 * @param string $url  Remote URL.
 * @param string $mime Detected image MIME type.
 * @return string
 */
function kototsugi_remote_image_filename( $url, $mime ) {
	$extensions = array(
		'image/jpeg' => 'jpg',
		'image/png'  => 'png',
		'image/gif'  => 'gif',
		'image/webp' => 'webp',
		'image/avif' => 'avif',
	);
	$path       = wp_parse_url( $url, PHP_URL_PATH );
	$basename   = $path ? sanitize_file_name( wp_basename( $path ) ) : '';
	$name       = $basename ? pathinfo( $basename, PATHINFO_FILENAME ) : '';
	$extension  = isset( $extensions[ $mime ] ) ? $extensions[ $mime ] : '';

	if ( ! $name ) {
		$name = 'kototsugi-image';
	}

	return sanitize_file_name( $name . '.' . $extension );
}

/**
 * Formats an attachment for the editor response.
 *
 * @param int  $attachment_id Attachment ID.
 * @param bool $reused        Whether an existing attachment was reused.
 * @return WP_REST_Response|WP_Error
 */
function kototsugi_remote_image_response( $attachment_id, $reused = false ) {
	$url = wp_get_attachment_url( $attachment_id );

	if ( ! $url ) {
		return new WP_Error(
			'kototsugi_attachment_url_missing',
			__( 'The imported image URL could not be created.', 'kototsugi' ),
			array( 'status' => 500 )
		);
	}

	return rest_ensure_response(
		array(
			'id'     => (int) $attachment_id,
			'url'    => esc_url_raw( $url ),
			'reused' => (bool) $reused,
		)
	);
}

/**
 * Downloads one remote image and stores it in the media library.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function kototsugi_import_remote_image( WP_REST_Request $request ) {
	$url     = esc_url_raw( (string) $request->get_param( 'url' ) );
	$alt     = sanitize_text_field( (string) $request->get_param( 'alt' ) );
	$post_id = absint( $request->get_param( 'post_id' ) );

	if ( ! kototsugi_is_safe_remote_image_url( $url ) ) {
		return new WP_Error(
			'kototsugi_unsafe_image_url',
			__( 'This image URL is not allowed.', 'kototsugi' ),
			array( 'status' => 400 )
		);
	}

	if ( $post_id && ! current_user_can( 'edit_post', $post_id ) ) {
		return new WP_Error(
			'kototsugi_invalid_image_parent',
			__( 'You are not allowed to attach images to this post.', 'kototsugi' ),
			array( 'status' => 403 )
		);
	}

	$existing_ids = get_posts(
		array(
			'post_type'              => 'attachment',
			'post_status'            => 'inherit',
			'fields'                 => 'ids',
			'posts_per_page'         => 1,
			'no_found_rows'          => true,
			'update_post_meta_cache' => false,
			'update_post_term_cache' => false,
			'meta_key'               => '_kototsugi_source_url', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- Exact source URL lookup prevents duplicate attachments and returns at most one ID.
			'meta_value'             => $url, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- Exact source URL lookup prevents duplicate attachments and returns at most one ID.
		)
	);

	if ( $existing_ids ) {
		$attachment_id = (int) $existing_ids[0];
		if ( ! current_user_can( 'edit_post', $attachment_id ) ) {
			return new WP_Error(
				'kototsugi_image_reuse_forbidden',
				__( 'You are not allowed to reuse this Media Library image.', 'kototsugi' ),
				array( 'status' => 403 )
			);
		}
		if ( $alt && ! get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ) ) {
			update_post_meta( $attachment_id, '_wp_attachment_image_alt', $alt );
		}
		return kototsugi_remote_image_response( $attachment_id, true );
	}

	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/image.php';
	require_once ABSPATH . 'wp-admin/includes/media.php';

	$max_bytes = min( KOTOTSUGI_MAX_REMOTE_IMAGE_BYTES, wp_max_upload_size() );
	$tmp_file  = wp_tempnam( 'kototsugi-image' );

	if ( ! $tmp_file ) {
		return new WP_Error(
			'kototsugi_image_temp_failed',
			__( 'The temporary file could not be created.', 'kototsugi' ),
			array( 'status' => 500 )
		);
	}

	$response = wp_safe_remote_get(
		$url,
		array(
			'timeout'             => 20,
			'redirection'         => 3,
			'stream'              => true,
			'filename'            => $tmp_file,
			'limit_response_size' => $max_bytes + 1,
			'headers'             => array( 'Accept' => 'image/*' ),
		)
	);

	if ( is_wp_error( $response ) ) {
		wp_delete_file( $tmp_file );
		return new WP_Error(
			'kototsugi_image_download_failed',
			__( 'The remote image could not be downloaded.', 'kototsugi' ),
			array( 'status' => 502 )
		);
	}

	if ( 200 !== wp_remote_retrieve_response_code( $response ) ) {
		wp_delete_file( $tmp_file );
		return new WP_Error(
			'kototsugi_image_http_error',
			__( 'The remote image returned an unexpected response.', 'kototsugi' ),
			array( 'status' => 502 )
		);
	}

	$file_size = filesize( $tmp_file );
	if ( ! $file_size || $file_size > $max_bytes ) {
		wp_delete_file( $tmp_file );
		return new WP_Error(
			'kototsugi_image_too_large',
			__( 'The remote image exceeds the upload size limit.', 'kototsugi' ),
			array( 'status' => 413 )
		);
	}

	$mime_type = wp_get_image_mime( $tmp_file );
	$filename  = $mime_type ? kototsugi_remote_image_filename( $url, $mime_type ) : '';
	$filetype  = $filename ? wp_check_filetype( $filename ) : array( 'type' => false );

	if ( ! $mime_type || empty( $filetype['type'] ) || $filetype['type'] !== $mime_type ) {
		wp_delete_file( $tmp_file );
		return new WP_Error(
			'kototsugi_image_type_not_allowed',
			__( 'The downloaded file is not a supported image.', 'kototsugi' ),
			array( 'status' => 415 )
		);
	}

	$file_array = array(
		'name'     => $filename,
		'tmp_name' => $tmp_file,
	);
	$description = $alt ? $alt : pathinfo( $filename, PATHINFO_FILENAME );
	$attachment_id = media_handle_sideload( $file_array, $post_id, $description );

	if ( is_wp_error( $attachment_id ) ) {
		if ( file_exists( $tmp_file ) ) {
			wp_delete_file( $tmp_file );
		}
		return $attachment_id;
	}

	if ( $alt ) {
		update_post_meta( $attachment_id, '_wp_attachment_image_alt', $alt );
	}
	update_post_meta( $attachment_id, '_kototsugi_source_url', $url );

	return kototsugi_remote_image_response( $attachment_id );
}

/**
 * Returns the bundled sample filename for a WordPress locale.
 *
 * @param string|null $locale Locale to resolve. Defaults to the current locale.
 * @return string
 */
function kototsugi_sample_markdown_name( $locale = null ) {
	$locale = $locale ? str_replace( '-', '_', $locale ) : determine_locale();
	$samples = array(
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

	return isset( $samples[ $locale ] ) ? $samples[ $locale ] : $samples['en_US'];
}

/**
 * Loads the importer only where block editing is available.
 */
function kototsugi_enqueue_editor_assets() {
	$editor_script = plugin_dir_path( __FILE__ ) . 'assets/editor.js';
	$editor_style  = plugin_dir_path( __FILE__ ) . 'assets/editor.css';
	$shared_style  = plugin_dir_path( __FILE__ ) . 'assets/style.css';
	$sample_name   = kototsugi_sample_markdown_name();
	$sample_file   = plugin_dir_path( __FILE__ ) . 'examples/' . $sample_name;
	$rules_file    = plugin_dir_path( __FILE__ ) . 'rules/KOTOTSUGI-RULES.md';

	wp_enqueue_script(
		'kototsugi-editor',
		KOTOTSUGI_URL . 'assets/editor.js',
		array(
			'wp-blocks',
			'wp-api-fetch',
			'wp-components',
			'wp-data',
			'wp-edit-post',
			'wp-editor',
			'wp-element',
			'wp-i18n',
			'wp-plugins',
		),
		file_exists( $editor_script ) ? (string) filemtime( $editor_script ) : KOTOTSUGI_VERSION,
		true
	);

	wp_set_script_translations(
		'kototsugi-editor',
		'kototsugi',
		plugin_dir_path( __FILE__ ) . 'languages'
	);

	wp_add_inline_script(
		'kototsugi-editor',
		'window.kototsugiEditorConfig = ' . wp_json_encode(
			array(
				'sampleMarkdownUrl' => add_query_arg(
					'ver',
					file_exists( $sample_file ) ? (string) filemtime( $sample_file ) : KOTOTSUGI_VERSION,
					KOTOTSUGI_URL . 'examples/' . $sample_name
				),
				'sampleMarkdownName' => $sample_name,
				'rulesMarkdownUrl'  => add_query_arg(
					'ver',
					file_exists( $rules_file ) ? (string) filemtime( $rules_file ) : KOTOTSUGI_VERSION,
					KOTOTSUGI_URL . 'rules/KOTOTSUGI-RULES.md'
				),
			)
		) . ';',
		'before'
	);

	wp_enqueue_style(
		'kototsugi-style',
		KOTOTSUGI_URL . 'assets/style.css',
		array(),
		file_exists( $shared_style ) ? (string) filemtime( $shared_style ) : KOTOTSUGI_VERSION
	);

	wp_enqueue_style(
		'kototsugi-editor',
		KOTOTSUGI_URL . 'assets/editor.css',
		array( 'kototsugi-style' ),
		file_exists( $editor_style ) ? (string) filemtime( $editor_style ) : KOTOTSUGI_VERSION
	);
}
add_action( 'enqueue_block_editor_assets', 'kototsugi_enqueue_editor_assets' );

/**
 * Keeps generated callouts readable on the public site without changing a theme's base styles.
 */
function kototsugi_enqueue_public_styles() {
	global $wp_query;

	$posts = isset( $wp_query->posts ) && is_array( $wp_query->posts ) ? $wp_query->posts : array();
	$uses_kototsugi_callout = false;

	foreach ( $posts as $post ) {
		if ( $post instanceof WP_Post && false !== strpos( $post->post_content, 'kototsugi-callout' ) ) {
			$uses_kototsugi_callout = true;
			break;
		}
	}

	if ( ! $uses_kototsugi_callout ) {
		return;
	}

	$shared_style = plugin_dir_path( __FILE__ ) . 'assets/style.css';

	wp_enqueue_style(
		'kototsugi-style',
		KOTOTSUGI_URL . 'assets/style.css',
		array(),
		file_exists( $shared_style ) ? (string) filemtime( $shared_style ) : KOTOTSUGI_VERSION
	);
}
add_action( 'wp_enqueue_scripts', 'kototsugi_enqueue_public_styles' );
