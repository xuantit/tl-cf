import cloudflare
import requests
from typing import Any, Optional


class CloudflareClient:
    def __init__(self, api_token: str):
        self._api = cloudflare.Cloudflare(api_token=api_token)
        self._api_token = api_token  # Store token for direct HTTP requests

    def verify_token(self) -> bool:
        try:
            self._api.user.tokens.verify()
            return True
        except Exception:
            return False

    def list_zones(self, name: Optional[str] = None) -> list[dict]:
        try:
            kwargs = {}
            if name:
                kwargs["name"] = name
            r = self._api.zones.list(**kwargs)
            results = []
            for zone in r:
                results.append(zone.model_dump() if hasattr(zone, 'model_dump') else dict(zone))
            return results
        except Exception as e:
            import logging
            logging.error(f"Failed to list zones: {e}")
            return []

    def get_zone(self, zone_id: str) -> Optional[dict]:
        try:
            result = self._api.zones.get(zone_id)
            if result:
                return result.model_dump() if hasattr(result, 'model_dump') else dict(result) if isinstance(result, dict) else None
            return None
        except Exception as e:
            import logging
            logging.error(f"Failed to get zone {zone_id}: {e}")
            return None

    def create_zone(self, name: str, account_id: Optional[str] = None, jump_start: bool = True) -> Optional[dict]:
        try:
            account_param = {"id": account_id} if account_id else None
            if not account_param:
                raise ValueError("account_id is required")
            extra_body = {"jump_start": jump_start} if jump_start else None
            result = self._api.zones.create(account=account_param, name=name, extra_body=extra_body)
            if result:
                return result.model_dump() if hasattr(result, 'model_dump') else dict(result) if isinstance(result, dict) else None
            return None
        except Exception as e:
            import logging
            error_msg = str(e)
            # Parse Cloudflare API errors
            if "already exists" in error_msg.lower() or "1004" in error_msg or "1093" in error_msg or "already hosted" in error_msg.lower():
                raise ValueError(f"Domain {name} đã tồn tại trong Cloudflare account khác. Cloudflare không cho phép một domain tồn tại ở nhiều accounts cùng lúc. Để chuyển domain:\n1. Xóa domain khỏi account cũ (hoặc liên hệ Cloudflare Support để transfer)\n2. Sau đó thêm vào account mới\n3. Cập nhật nameserver tại registrar")
            if "permission" in error_msg.lower() or "unauthorized" in error_msg.lower():
                raise ValueError(f"API Token không có quyền tạo zone. Cần quyền Zone:Edit và Account:Zone:Create.")
            logging.error(f"Cloudflare API error creating zone {name}: {e}")
            raise ValueError(f"Lỗi Cloudflare API: {error_msg}")

    def delete_zone(self, zone_id: str) -> bool:
        try:
            self._api.zones.delete(zone_id)
            return True
        except Exception:
            return False

    # DNS - using cf.dns.records (not cf.zones.dns_records)
    def list_dns_records(self, zone_id: str, type: Optional[str] = None) -> list[dict]:
        try:
            kwargs = {"zone_id": zone_id}
            if type:
                kwargs["type"] = type
            r = self._api.dns.records.list(**kwargs)
            results = []
            for rec in r:
                results.append(rec.model_dump() if hasattr(rec, 'model_dump') else dict(rec))
            return results
        except Exception as e:
            import logging
            logging.error(f"Failed to list DNS records: {e}")
            return []

    def create_dns_record(self, zone_id: str, data: dict) -> Optional[dict]:
        try:
            # data: type, name, content, ttl, proxied
            result = self._api.dns.records.create(
                zone_id=zone_id,
                type=data.get("type", "A"),
                name=data.get("name", "@"),
                content=data.get("content", ""),
                ttl=data.get("ttl", 1),
                proxied=data.get("proxied", False),
            )
            if result:
                return result.model_dump() if hasattr(result, 'model_dump') else dict(result) if isinstance(result, dict) else None
            return None
        except Exception as e:
            import logging
            logging.error(f"Failed to create DNS record: {e}")
            return None

    def update_dns_record(self, zone_id: str, record_id: str, data: dict) -> Optional[dict]:
        try:
            result = self._api.dns.records.update(
                dns_record_id=record_id,
                zone_id=zone_id,
                type=data.get("type", "A"),
                name=data.get("name", "@"),
                content=data.get("content", ""),
                ttl=data.get("ttl", 1),
                proxied=data.get("proxied", False),
            )
            if result:
                return result.model_dump() if hasattr(result, 'model_dump') else dict(result) if isinstance(result, dict) else None
            return None
        except Exception as e:
            import logging
            logging.error(f"Failed to update DNS record: {e}")
            return None

    def delete_dns_record(self, zone_id: str, record_id: str) -> bool:
        try:
            self._api.dns.records.delete(dns_record_id=record_id, zone_id=zone_id)
            return True
        except Exception as e:
            import logging
            logging.error(f"Failed to delete DNS record: {e}")
            return False

    # Zone settings (cache, etc.)
    def list_zone_settings(self, zone_id: str) -> list[dict]:
        try:
            result = self._api.zones.settings.get(zone_id=zone_id)
            if result:
                return result.model_dump() if hasattr(result, 'model_dump') else [dict(result)] if isinstance(result, dict) else []
            return []
        except Exception as e:
            import logging
            logging.error(f"Failed to list zone settings for {zone_id}: {e}")
            return []

    def edit_zone_setting(self, zone_id: str, setting_id: str, value: Any) -> Optional[dict]:
        try:
            result = self._api.zones.settings.edit(zone_id=zone_id, setting_id=setting_id, value=value)
            if result:
                return result.model_dump() if hasattr(result, 'model_dump') else dict(result) if isinstance(result, dict) else None
            return None
        except Exception as e:
            import logging
            logging.error(f"Failed to edit zone setting {setting_id} for {zone_id}: {e}")
            return None

    def get_ssl_mode(self, zone_id: str) -> Optional[str]:
        """
        Get SSL/TLS encryption mode for a zone.
        Returns: "off", "flexible", "full", "strict", or None if not found
        """
        try:
            # Try direct API call to get SSL setting
            result = self._api.zones.settings.get(zone_id=zone_id, setting_id="ssl")
            if result:
                ssl_setting = result.model_dump() if hasattr(result, 'model_dump') else dict(result) if isinstance(result, dict) else None
                if ssl_setting:
                    if isinstance(ssl_setting, dict):
                        return ssl_setting.get("value")
                    elif hasattr(ssl_setting, "value"):
                        return ssl_setting.value
            # Fallback: try listing all settings
            settings = self.list_zone_settings(zone_id)
            for setting in settings:
                if isinstance(setting, dict):
                    if setting.get("id") == "ssl":
                        return setting.get("value")
                elif hasattr(setting, "id") and setting.id == "ssl":
                    return setting.value if hasattr(setting, "value") else None
            return None
        except Exception as e:
            import logging
            logging.error(f"Failed to get SSL mode for zone {zone_id}: {e}")
            return None

    def set_ssl_mode(self, zone_id: str, mode: str = "flexible") -> bool:
        """
        Set SSL/TLS encryption mode for a zone.
        Valid modes: "off", "flexible", "full", "strict"
        """
        try:
            result = self.edit_zone_setting(zone_id=zone_id, setting_id="ssl", value=mode)
            return result is not None
        except Exception as e:
            import logging
            logging.error(f"Failed to set SSL mode to {mode} for zone {zone_id}: {e}")
            return False

    def apply_default_cache_settings(self, zone_id: str) -> bool:
        """
        Apply default cache settings for a zone:
        - Cache Level: "simplified" (Ignore query string)
        - Browser Cache TTL: 0 (Respect Existing Headers)
        Note: cache_deception_armor, cache_by_device_type, sort_query_string_for_cache 
        are cache key settings in Cache Rules, not zone settings.
        Tiered Cache topology is set via separate API endpoint.
        """
        import logging
        try:
            # Only apply valid zone settings
            # cache_deception_armor, cache_by_device_type, sort_query_string_for_cache 
            # are part of Cache Rules cache_key settings, not zone settings
            settings_to_apply = {
                "cache_level": "simplified",  # Ignore query string
                "browser_cache_ttl": 0,  # Respect Existing Headers
            }
            
            success_count = 0
            for setting_id, value in settings_to_apply.items():
                try:
                    result = self.edit_zone_setting(zone_id=zone_id, setting_id=setting_id, value=value)
                    if result is not None:
                        success_count += 1
                        logging.info(f"Set {setting_id} to {value} for zone {zone_id}")
                    else:
                        logging.warning(f"Failed to set {setting_id} for zone {zone_id}")
                except Exception as e:
                    logging.warning(f"Error setting {setting_id} for zone {zone_id}: {e}")
            
            # Try to set tiered cache topology to "Smart Tiered Caching Topology"
            # According to Cloudflare API: PATCH /zones/{zone_id}/cache/tiered_cache_smart_topology_enable
            # With body: {"value": "on"}
            # Note: This may not be available in the Python SDK, so we'll use HTTP request directly
            try:
                headers = {
                    "Authorization": f"Bearer {self._api_token}",
                    "Content-Type": "application/json"
                }
                
                # First, try to enable Argo Tiered Caching if not already enabled
                # Smart Tiered Cache requires Argo Tiered Caching to be enabled first
                try:
                    argo_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/argo/tiered_caching"
                    # Check current status
                    argo_get = requests.get(argo_url, headers=headers, timeout=10)
                    if argo_get.status_code == 200:
                        argo_data = argo_get.json()
                        if argo_data.get("success"):
                            argo_value = argo_data.get("result", {}).get("value", {})
                            # Handle different formats: string "off"/"on", dict with "enabled", or dict with nested structure
                            argo_enabled = False
                            if isinstance(argo_value, str):
                                # String format: "off" or "on"
                                argo_enabled = argo_value.lower() == "on"
                            elif isinstance(argo_value, dict):
                                # Dict format: check for "enabled" key or nested structure
                                if "enabled" in argo_value:
                                    argo_enabled = argo_value.get("enabled", False)
                                elif isinstance(argo_value.get("value"), dict) and "enabled" in argo_value.get("value", {}):
                                    argo_enabled = argo_value.get("value", {}).get("enabled", False)
                            
                            logging.info(f"Argo Tiered Caching status for zone {zone_id}: enabled={argo_enabled}")
                            if not argo_enabled:
                                # Enable Argo Tiered Caching first - use string format "on"
                                argo_patch = requests.patch(argo_url, json={"value": "on"}, headers=headers, timeout=10)
                                if argo_patch.status_code == 200:
                                    patch_data = argo_patch.json()
                                    if patch_data.get("success"):
                                        logging.info(f"Enabled Argo Tiered Caching for zone {zone_id}")
                                    else:
                                        logging.warning(f"Failed to enable Argo Tiered Caching: {patch_data.get('errors', [])}")
                                else:
                                    logging.warning(f"Failed to enable Argo Tiered Caching: HTTP {argo_patch.status_code} - {argo_patch.text}")
                            else:
                                logging.info(f"Argo Tiered Caching already enabled for zone {zone_id}")
                        else:
                            logging.warning(f"Failed to get Argo Tiered Caching status: {argo_data.get('errors', [])}")
                    else:
                        logging.warning(f"Failed to get Argo Tiered Caching status: HTTP {argo_get.status_code} - {argo_get.text}")
                except Exception as argo_error:
                    logging.warning(f"Argo Tiered Caching check/enable failed: {argo_error}", exc_info=True)
                
                # Use direct HTTP request to Cloudflare API for Smart Tiered Cache
                url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/cache/tiered_cache_smart_topology_enable"
                data = {"value": "on"}
                
                try:
                    response = requests.patch(url, json=data, headers=headers, timeout=10)
                    if response.status_code == 200:
                        result_data = response.json()
                        if result_data.get("success"):
                            success_count += 1
                            logging.info(f"Set tiered cache to Smart Tiered Caching Topology for zone {zone_id}")
                        else:
                            errors = result_data.get("errors", [])
                            logging.error(f"Failed to set Smart Tiered Cache - API returned success=false: {errors}")
                            # Log full response for debugging
                            logging.error(f"Full API response: {result_data}")
                    elif response.status_code == 403:
                        error_data = response.json() if response.text else {}
                        errors = error_data.get("errors", [])
                        logging.error(f"Permission denied (403) for Smart Tiered Cache. Errors: {errors}")
                        logging.error(f"API Token may need 'Zone Settings:Write' or 'Zone:Write' permission.")
                        logging.error(f"Full response: {response.text}")
                    elif response.status_code == 400:
                        error_data = response.json() if response.text else {}
                        errors = error_data.get("errors", [])
                        logging.error(f"Bad Request (400) for Smart Tiered Cache. Errors: {errors}")
                        logging.error(f"Full response: {response.text}")
                    else:
                        logging.error(f"Failed to set Smart Tiered Cache: HTTP {response.status_code} - {response.text}")
                except Exception as http_error:
                    logging.warning(f"HTTP request failed for Smart Tiered Cache: {http_error}")
                    # Try SDK methods as fallback
                    try:
                        if hasattr(self._api, 'zones') and hasattr(self._api.zones, 'cache'):
                            # Try different possible method names
                            methods_to_try = [
                                ('smart_tiered_cache', 'edit'),
                                ('tiered_cache_smart_topology_enable', 'edit'),
                            ]
                            for method_name, action in methods_to_try:
                                if hasattr(self._api.zones.cache, method_name):
                                    try:
                                        method = getattr(self._api.zones.cache, method_name)
                                        if hasattr(method, action):
                                            action_method = getattr(method, action)
                                            cache_result = action_method(zone_id=zone_id, value="on")
                                            if cache_result:
                                                success_count += 1
                                                logging.info(f"Set tiered cache to Smart via {method_name} for zone {zone_id}")
                                                break
                                    except Exception:
                                        continue
                    except Exception as sdk_error:
                        logging.debug(f"SDK methods also failed: {sdk_error}")
                
                # If all methods fail, log warning
                if success_count == 0:
                    logging.warning(f"Tiered cache topology setting failed for zone {zone_id} - may need manual configuration via dashboard. API Token may need 'Zone Settings:Edit' permission.")
            except Exception as e:
                logging.warning(f"Error setting tiered cache topology for zone {zone_id}: {e}")
            
            return success_count > 0
        except Exception as e:
            logging.error(f"Failed to apply default cache settings for zone {zone_id}: {e}")
            return False

    def create_cache_rule(self, zone_id: str, account_id: str, name: str = "cache", ignore_query_string: bool = True) -> Optional[dict]:
        """
        Create a cache rule for a zone using Rulesets API.
        Creates a rule named "cache" that applies to all incoming requests and ignores query string.
        Note: Cache Rules use Rulesets API which may require specific permissions.
        """
        import logging
        try:
            # Prepare headers for HTTP requests
            headers = {
                "Authorization": f"Bearer {self._api_token}",
                "Content-Type": "application/json"
            }
            
            # Expression: match all requests for this zone
            expression = "true"  # Match all incoming requests
            
            # Build action_parameters for set_cache_settings
            # Format for Cache Rules: cache_key.custom_key.query_string.exclude.all
            action_parameters = {
                "cache": True,
            }
            
            # Add cache_key to enable "Ignore query string" in Cache Rules
            # Format based on actual Cloudflare API payload:
            # - custom_key.query_string.exclude: {"all": true} to ignore all query strings
            # - ignore_query_strings_order: false (can be true/false, false is default)
            if ignore_query_string:
                action_parameters["cache_key"] = {
                    "ignore_query_strings_order": False,  # Sort query string option (false = default)
                    "custom_key": {
                        "query_string": {
                            "exclude": {
                                "all": True  # Ignore all query strings - this enables "Ignore query string" checkbox
                            }
                        }
                    }
                }
                logging.info(f"Added cache_key with custom_key.query_string.exclude.all=True to enable 'Ignore query string'")
            else:
                logging.warning(f"ignore_query_string is False, cache_key will not include custom_key")
            
            # Create ruleset for cache settings at zone level
            # Include description for the rule
            # Log action_parameters to verify cache_key is included
            import json
            logging.debug(f"action_parameters before creating rule: {json.dumps(action_parameters, indent=2)}")
            
            ruleset_data = {
                "name": name,
                "kind": "zone",
                "phase": "http_request_cache_settings",
                "rules": [
                    {
                        "expression": expression,
                        "description": f"Cache rule: {name} - All incoming requests",
                        "action": "set_cache_settings",
                        "action_parameters": action_parameters
                    }
                ]
            }
            
            # Log the rule to verify cache_key structure
            logging.debug(f"Rule data: {json.dumps(ruleset_data['rules'][0], indent=2)}")
            
            # Try to create or update cache ruleset
            # Cloudflare only allows one zone-level ruleset per phase, so we must update existing one
            # Always try to list and update first, never create new if limit is reached
            existing_ruleset = None
            ruleset_id = None
            
            # First, always try to list existing rulesets using HTTP request directly
            # SDK doesn't support phase parameter in list(), so use direct HTTP request
            try:
                rulesets_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets"
                rulesets_params = {"phase": "http_request_cache_settings"}
                rulesets_response = requests.get(rulesets_url, headers=headers, params=rulesets_params, timeout=10)
                
                if rulesets_response.status_code == 200:
                    rulesets_data = rulesets_response.json()
                    if rulesets_data.get("success"):
                        rulesets_list = rulesets_data.get("result", [])
                        if rulesets_list:
                            # Log all found rulesets for debugging
                            logging.info(f"Found {len(rulesets_list)} ruleset(s) for phase http_request_cache_settings:")
                            for idx, rs in enumerate(rulesets_list):
                                logging.info(f"  Ruleset {idx+1}: id={rs.get('id')}, kind={rs.get('kind')}, phase={rs.get('phase')}, name={rs.get('name')}")
                            
                            # Filter to find zone ruleset (not managed) for cache settings phase
                            for ruleset in rulesets_list:
                                ruleset_kind = ruleset.get("kind", "")
                                ruleset_phase = ruleset.get("phase", "")
                                # Only use zone rulesets (not managed) for http_request_cache_settings phase
                                if ruleset_kind == "zone" and ruleset_phase == "http_request_cache_settings":
                                    existing_ruleset = ruleset
                                    ruleset_id = existing_ruleset.get("id")
                                    logging.info(f"Found existing zone ruleset {ruleset_id} for phase http_request_cache_settings")
                                    break
                            # If no zone ruleset found, existing_ruleset will remain None
                            if not existing_ruleset:
                                logging.info(f"No zone ruleset found for phase http_request_cache_settings. Will create new one.")
                elif rulesets_response.status_code == 400:
                    error_data = rulesets_response.json() if rulesets_response.text else {}
                    error_msg = str(error_data.get("errors", []))
                    if "exceeded maximum" in error_msg.lower() or "20217" in error_msg:
                        logging.warning(f"Maximum rulesets limit reached. Cannot list or create new ruleset. Please update existing ruleset manually via dashboard.")
                        return None
            except Exception as list_error:
                error_msg = str(list_error)
                logging.warning(f"Failed to list existing rulesets: {error_msg}")
                # If list fails with "exceeded maximum" error, we know ruleset exists but can't list it
                # In this case, we should not try to create new one
                if "exceeded maximum" in error_msg.lower() or "20217" in error_msg:
                    logging.warning(f"Maximum rulesets limit reached. Cannot list or create new ruleset. Please update existing ruleset manually via dashboard.")
                    return None
            
            # If we found an existing ruleset, always update it using HTTP request directly
            if existing_ruleset and ruleset_id:
                # Update existing ruleset - Cloudflare only allows one zone ruleset per phase
                try:
                    # Get current rules
                    current_rules = existing_ruleset.get("rules", [])
                    # Check if rule with same expression already exists
                    rule_exists = any(
                        rule.get("expression") == expression 
                        for rule in current_rules
                    )
                    if not rule_exists:
                        # Add new rule to existing rules
                        updated_rules = current_rules + ruleset_data["rules"]
                    else:
                        # Rule exists, update it
                        updated_rules = []
                        for rule in current_rules:
                            if rule.get("expression") == expression:
                                # Update existing rule
                                updated_rules.append(ruleset_data["rules"][0])
                            else:
                                updated_rules.append(rule)
                    
                    # Check if this is a zone ruleset (not managed) - managed rulesets cannot be updated
                    ruleset_kind = existing_ruleset.get("kind", "")
                    ruleset_phase = existing_ruleset.get("phase", "")
                    
                    if ruleset_kind != "zone":
                        logging.warning(f"Cannot update ruleset {ruleset_id} - it is a '{ruleset_kind}' ruleset, not a 'zone' ruleset. Managed rulesets cannot be updated.")
                        logging.info(f"Will create a new zone ruleset instead.")
                        # Reset to create new zone ruleset
                        existing_ruleset = None
                        ruleset_id = None
                    elif ruleset_phase != "http_request_cache_settings":
                        logging.warning(f"Found ruleset {ruleset_id} but phase is '{ruleset_phase}', not 'http_request_cache_settings'. Will create new one.")
                        existing_ruleset = None
                        ruleset_id = None
                    else:
                        # Update ruleset using HTTP request directly
                        update_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/{ruleset_id}"
                        # Include all required fields: name, kind, phase, rules
                        update_payload = {
                            "name": name,  # Set name to "cache"
                            "kind": "zone",
                            "phase": "http_request_cache_settings",
                            "rules": updated_rules
                        }
                        
                        # Log request details for debugging
                        import json
                        logging.info(f"Updating zone ruleset {ruleset_id} for zone {zone_id}")
                        logging.info(f"Request payload (JSON): {json.dumps(update_payload, indent=2)}")
                        
                        update_response = requests.put(update_url, json=update_payload, headers=headers, timeout=10)
                        
                        # Log response details
                        logging.info(f"Update ruleset response status: {update_response.status_code}")
                        if update_response.text:
                            logging.debug(f"Update ruleset response body: {update_response.text}")
                        
                        if update_response.status_code == 200:
                            update_data = update_response.json()
                            if update_data.get("success"):
                                logging.info(f"Updated cache rule '{name}' in existing ruleset for zone {zone_id}")
                                return update_data.get("result")
                            else:
                                errors = update_data.get("errors", [])
                                logging.warning(f"Failed to update ruleset - API returned success=false: {errors}")
                                logging.warning(f"Full response: {update_data}")
                        elif update_response.status_code == 403:
                            error_data = update_response.json() if update_response.text else {}
                            errors = error_data.get("errors", [])
                            logging.error(f"Permission denied (403) when updating ruleset. Errors: {errors}")
                            logging.error(f"Full response: {error_data}")
                            logging.error(f"Request URL: {update_url}")
                            logging.error(f"Request payload: {update_payload}")
                            logging.warning(f"API Token may need 'Zone Cache Rules:Edit' and 'Account Rulesets:Edit' permissions.")
                            logging.warning(f"Also ensure the token has access to zone {zone_id} in Account Resources section.")
                        else:
                            error_data = update_response.json() if update_response.text else {}
                            errors = error_data.get("errors", [])
                            logging.warning(f"Failed to update ruleset: HTTP {update_response.status_code} - {errors}")
                            logging.warning(f"Full response: {error_data}")
                except Exception as update_error:
                    error_msg = str(update_error)
                    logging.warning(f"Failed to update existing ruleset: {error_msg}")
                    # If update fails with "exceeded maximum", log and return None
                    if "exceeded maximum" in error_msg.lower() or "20217" in error_msg:
                        logging.warning(f"Maximum rulesets limit reached. Cannot update ruleset. Please update manually via dashboard.")
                        return None
            else:
                # No existing ruleset found, try to create new one using HTTP request directly
                # But first check if list failed due to limit - if so, don't create
                try:
                    create_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets"
                    create_payload = {
                        "name": ruleset_data["name"],
                        "kind": ruleset_data["kind"],
                        "phase": ruleset_data["phase"],
                        "rules": ruleset_data["rules"]
                    }
                    
                    create_response = requests.post(create_url, json=create_payload, headers=headers, timeout=10)
                    if create_response.status_code == 200:
                        create_data = create_response.json()
                        if create_data.get("success"):
                            logging.info(f"Successfully created cache rule '{name}' for zone {zone_id}")
                            return create_data.get("result")
                        else:
                            errors = create_data.get("errors", [])
                            logging.warning(f"Failed to create ruleset - API returned success=false: {errors}")
                    elif create_response.status_code == 403:
                        error_data = create_response.json() if create_response.text else {}
                        errors = error_data.get("errors", [])
                        logging.warning(f"Permission denied (403) when creating ruleset. Errors: {errors}")
                        logging.warning(f"API Token may need 'Zone Cache Rules:Edit' and 'Account Rulesets:Edit' permissions.")
                    elif create_response.status_code == 400:
                        error_data = create_response.json() if create_response.text else {}
                        errors = error_data.get("errors", [])
                        error_msg = str(errors)
                        if "exceeded maximum" in error_msg.lower() or "20217" in error_msg:
                            logging.warning(f"Maximum rulesets limit reached. Cannot create new ruleset. Please update existing ruleset manually via dashboard.")
                            return None
                        else:
                            logging.warning(f"Bad Request (400) when creating ruleset: {errors}")
                    else:
                        error_data = create_response.json() if create_response.text else {}
                        errors = error_data.get("errors", [])
                        logging.warning(f"Failed to create cache ruleset: HTTP {create_response.status_code} - {errors}")
                except Exception as create_error:
                    error_msg = str(create_error)
                    logging.warning(f"Failed to create cache ruleset: {error_msg}")
                    # Check if it's a permission error or limit exceeded
                    if "403" in error_msg or "Authentication" in error_msg or "permission" in error_msg.lower():
                        logging.warning(f"API Token may need 'Zone Cache Rules:Edit' and 'Account Rulesets:Edit' permissions for cache rules.")
                    elif "exceeded maximum" in error_msg.lower() or "20217" in error_msg:
                        logging.warning(f"Maximum rulesets limit reached. Cannot create new ruleset. Please update existing ruleset manually via dashboard.")
                        return None
            
            # Fallback: Log that cache rule may need manual creation
            logging.warning(f"Cache rule '{name}' creation failed for zone {zone_id}. Zone cache settings (cache_level=simplified) are already configured. Cache rule can be created manually via dashboard.")
            return None
        except Exception as e:
            logging.error(f"Failed to create cache rule for zone {zone_id}: {e}", exc_info=True)
            return None

    # Page Rules (deprecated in favor of Ruleset, but still available on some plans)
    # Using cf.page_rules (not cf.zones.pagerules)
    def list_pagerules(self, zone_id: str) -> list[dict]:
        try:
            r = self._api.page_rules.list(zone_id=zone_id)
            results = []
            for rule in r:
                results.append(rule.model_dump() if hasattr(rule, 'model_dump') else dict(rule))
            return results
        except Exception as e:
            import logging
            logging.error(f"Failed to list page rules for {zone_id}: {e}")
            return []

    def create_pagerule(self, zone_id: str, targets: list, actions: list, priority: int = 1) -> Optional[dict]:
        try:
            result = self._api.page_rules.create(
                zone_id=zone_id,
                targets=targets,
                actions=actions,
                priority=priority
            )
            if result:
                return result.model_dump() if hasattr(result, 'model_dump') else dict(result) if isinstance(result, dict) else None
            return None
        except Exception as e:
            import logging
            logging.error(f"Failed to create page rule: {e}")
            return None

    def delete_pagerule(self, zone_id: str, rule_id: str) -> bool:
        try:
            self._api.page_rules.delete(page_rule_id=rule_id, zone_id=zone_id)
            return True
        except Exception as e:
            import logging
            logging.error(f"Failed to delete page rule {rule_id} for {zone_id}: {e}")
            return False
