shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, specular_disabled;

// Production material, not a mesh generator or a fake 2D sprite.
// Assign the original-quality color/roughness textures from approved GLB assets.
uniform sampler2D base_color_texture : source_color, filter_linear_mipmap, repeat_enable;
uniform vec4 base_tint : source_color = vec4(1.0);
uniform vec4 shadow_tint : source_color = vec4(0.45, 0.37, 0.62, 1.0);
uniform float shadow_threshold : hint_range(-0.2, 1.0) = 0.18;
uniform float penumbra : hint_range(0.005, 0.35) = 0.08;
uniform float shade_strength : hint_range(0.0, 1.0) = 0.57;
uniform float rim_strength : hint_range(0.0, 1.0) = 0.18;
uniform float rim_power : hint_range(1.0, 8.0) = 3.5;
uniform float roughness : hint_range(0.0, 1.0) = 0.8;

void fragment() {
    vec4 color = texture(base_color_texture, UV) * base_tint;
    ALBEDO = color.rgb;
    ALPHA = color.a;
    ROUGHNESS = roughness;
    float facing = clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0);
    EMISSION = ALBEDO * rim_strength * pow(1.0 - facing, rim_power);
}

void light() {
    float n_dot_l = dot(normalize(NORMAL), normalize(LIGHT));
    float lit = smoothstep(shadow_threshold - penumbra,
                           shadow_threshold + penumbra, n_dot_l);
    vec3 shadow = mix(vec3(1.0), shadow_tint.rgb, shade_strength);
    vec3 tone = mix(shadow, vec3(1.0), lit);
    DIFFUSE_LIGHT += ALBEDO * tone * LIGHT_COLOR * ATTENUATION;
}
