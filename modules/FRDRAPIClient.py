from util.util import Util
from globus_sdk import RefreshTokenAuthorizer, NativeAppAuthClient
from globus_sdk import BaseClient
import logging
from util.config_loader import config
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib import parse


class DataPublicationClient(BaseClient):
    allowed_authorizer_types = [RefreshTokenAuthorizer]
    service_name = "datapublication"
    def __init__(self, base_url, **kwargs):
        self._logger = logging.getLogger(
            "frdr-encryption-client.DataPublicationClient")
        app_name = kwargs.pop(
            'app_name', config.GLOBUS_DATA_PUBLICATION_CLIENT_NAME)
        BaseClient.__init__(self, base_url=base_url,
                            app_name=app_name, **kwargs)
        self._headers = {'Content-Type': 'application/json'}

    def update_requestitem(self, data):
        return self.put('requestitem', data=data, headers=self._headers)


class FRDRAPIClient():

    def __init__(self):
        self._logger = logging.getLogger(
            "frdr-encryption-client.FRDR-API-client")
        self._pub_client = None

    def login(self, base_url, success_msg=None):
        """Log into FRDR for API usage.

        Args:
            base_url (string): FRDR API base url
            success_msg (string, optional): The message shown in the browser once when the user logs in successfully. Defaults to None.

        Raises:
            Exception: If there is any error when logging into FRDR
        """
        if success_msg is None:
            success_msg = "Authentication to FRDR successful, you can close the browser now."
        try:
            tokens = self._interactive_login(success_msg)

            pub_tokens = tokens['publish.api.frdr.ca']

            pub_authorizer = RefreshTokenAuthorizer(
                refresh_token=pub_tokens['refresh_token'], 
                auth_client=self._load_auth_client(),
                access_token=pub_tokens['access_token'], 
                expires_at=pub_tokens['expires_at_seconds'])

            pub_client = DataPublicationClient(
                base_url, authorizer=pub_authorizer)
            self._pub_client = pub_client
        except Exception as e:
            self._logger.error(
                "Failed to auth for FRDR API usage. {}".format(e))
            raise Exception(e)

    def update_requestitem(self, data):
        """Update requestitem data on FRDR when depositors grant access
           to the key on FRDR Encryption App.

        Args:
            data (dict): {"expires": The expiry data of the granted access, 
                          "vault_dataset_id": The id for the dataset on Vault,
                          "vault_requester_id": The id for the requester on Vault}

        Returns:
            [string]: REST API call response 
        """
        return self._pub_client.update_requestitem(data)

    def _load_auth_client(self):
        return NativeAppAuthClient(
            config.GLOBUS_DATA_PUBLICATION_CLIENT_ID,
            app_name=config.GLOBUS_DATA_PUBLICATION_CLIENT_NAME)

    def _token_response_to_dict(self, token_response):
        resource_servers = ('publish.api.frdr.ca', )
        ret_toks = {}

        for res_server in resource_servers:
            try:
                token = token_response.by_resource_server[res_server]
                ret_toks[res_server] = token
            except:
                pass

        return ret_toks

    def _interactive_login(self, success_msg):
        native_client = self._load_auth_client()

        port = Util.find_free_port()
        native_client.oauth2_start_flow(
            requested_scopes=(
                'urn:globus:auth:scope:publish.api.frdr.org:all'),
            refresh_tokens=True,
            redirect_uri='http://localhost:{}'.format(port))
        auth_url = native_client.oauth2_get_authorize_url()
        webbrowser.open(auth_url)
        auth_code = self._login_get_token(port ,success_msg)

        if auth_code is None:
            raise TimeoutError(
                "You login process has expired. Please try again")

        tkns = native_client.oauth2_exchange_code_for_tokens(auth_code)
        return self._token_response_to_dict(tkns)

    def _login_get_token(self, port, success_msg):

        class HttpServ(HTTPServer):
            def __init__(self, *args, **kwargs):
                HTTPServer.__init__(self, *args, **kwargs)
                self.token = None

        class AuthHandler(BaseHTTPRequestHandler):
            token = ''

            def do_GET(self):
                params = parse.parse_qs(self.path.split('?')[1])
                self.server.token = params['code'][0]
                self.send_response(200)
                self.end_headers()
                self.wfile.write(str.encode(
                    "<div>{}</div>".format(success_msg)))

        server_address = ('', port)
        httpd = HttpServ(server_address, AuthHandler)
        httpd.timeout = config.FRDR_API_LOGIN_TIMEOUT
        httpd.handle_request()
        return httpd.token